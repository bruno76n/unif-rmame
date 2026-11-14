/**
 * El worker de las pruebas de punta a punta: las mismas tareas que el worker de verdad (`listaDeTareas`, con la bandeja
 * de eventos, el reloj y cada trabajo de los módulos) sobre la base del servidor de prueba, corridas con `runOnce` de
 * Graphile Worker cuando la prueba lo pide, y con un reloj que la prueba adelanta para los trabajos programados y el
 * cuadre de la noche.
 * Fase 21 · docs/fases/21-pruebas-de-punta-a-punta.md (parte 1: «un reloj que se adelanta para los trabajos y el cuadre
 * de la noche») y docs/cimientos/EVENTOS-Y-TRABAJOS.md («Los trabajos programados»)
 *
 * El reloj es solo del worker: la API y Postgres siguen en la hora de la máquina, así que una acción de la prueba pasa
 * «hoy» y la noche que se corre después es la de hoy o una que sigue.
 */

import { zonaDelNegocio } from "@uniformame/compartido/calculos/fechas";
import { runOnce } from "graphile-worker";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { escribirBitacoraConAdmin, guardarEventosConAdmin } from "../acciones/corredor.ts";
import type { Almacen } from "../almacen.ts";
import { crearBase } from "../base/conexion.ts";
import type { EnviarCorreo } from "../correo.ts";
import { esquemaDelWorker } from "../trabajos/esquema.ts";
import { correrReloj } from "../trabajos/reloj.ts";
import { contextoDeTrabajo, type DependenciasDelTrabajador, listaDeTareas } from "../trabajos/trabajador.ts";
import type { ServidorDePrueba } from "./servidor-de-prueba.ts";

/** Lo que dejó un cuadre de la noche. */
export interface CuadreDeLaNoche {
	fecha: string;
	estado: string;
	proyecciones_corregidas: number;
	diferencias_creadas: number;
	excepciones_creadas: number;
	error: string | null;
}

/** Una tarea del worker que falló, con su error. */
export interface TareaFallida {
	tarea: string;
	error: string;
}

/** El worker de prueba. */
export interface TrabajadorDePrueba {
	/** La hora del worker. */
	ahora: () => Temporal.Instant;
	/** Pone el reloj del worker en un momento (nunca hacia atrás de lo que ya corrió: el periodo de cada vuelta es único). */
	fijar: (momento: Temporal.Instant | string) => void;
	/** Corre lo que hay en la cola, como el worker, hasta que no quede nada listo; falla si alguna tarea falló. */
	procesar: () => Promise<void>;
	/** Una vuelta del reloj a la hora del worker (encola lo que ya toca) y la cola. */
	vueltaDelReloj: () => Promise<void>;
	/**
	 * La noche: pone el reloj a la hora del cuadre (`inventario.hora_cuadre`) del día que sigue al de la hora del worker,
	 * da una vuelta del reloj y corre todo lo que encola (el cuadre, y lo que corre al terminar). Cada noche es otro día.
	 * @returns El cuadre de ese día.
	 */
	noche: () => Promise<CuadreDeLaNoche>;
	/** Las tareas que fallaron y siguen en la cola. */
	fallidas: () => Promise<TareaFallida[]>;
}

/** Lo que guarda Graphile Worker de una tarea que falló. */
const fallida = z.object({ tarea: z.string(), error: z.string() });

/**
 * Arma el worker de prueba sobre el servidor de prueba, con sus mismos módulos.
 * @param servidor El servidor de prueba: su base y sus módulos.
 * @param opciones Cómo sale el correo (el simulador de Resend), el almacén (el de R2) y la dirección de la web.
 */
export function crearTrabajadorDePrueba(
	servidor: ServidorDePrueba,
	opciones: { enviarCorreo: EnviarCorreo; almacen?: Almacen; dominioWeb: string },
): TrabajadorDePrueba {
	let reloj = Temporal.Now.instant();
	const dependencias: DependenciasDelTrabajador = {
		base: crearBase(servidor.base.app),
		registro: servidor.modulos,
		servicios: { guardarEventos: guardarEventosConAdmin, escribirBitacora: escribirBitacoraConAdmin },
		enviarCorreo: opciones.enviarCorreo,
		dominioWeb: opciones.dominioWeb,
		...(opciones.almacen === undefined ? {} : { almacen: opciones.almacen }),
		reloj: () => reloj,
	};
	const fallidas = async (): Promise<TareaFallida[]> =>
		z
			.array(fallida)
			.parse(
				(
					await servidor.base.dueno.query(
						`SELECT task_identifier AS tarea, last_error AS error FROM ${esquemaDelWorker}.jobs WHERE last_error IS NOT NULL`,
					)
				).rows,
			);
	const procesar = async (): Promise<void> => {
		await runOnce({ pgPool: servidor.base.app, schema: esquemaDelWorker, taskList: listaDeTareas(dependencias) });
		const fallaron = await fallidas();
		if (fallaron.length > 0) {
			throw new Error(`fallaron tareas del worker: ${fallaron.map((una) => `${una.tarea}: ${una.error}`).join("; ")}`);
		}
	};
	const vueltaDelReloj = async (): Promise<void> => {
		await correrReloj(dependencias.registro.trabajos.values(), contextoDeTrabajo(dependencias, "reloj"));
		await procesar();
	};
	return {
		ahora: () => reloj,
		fijar: (momento) => {
			reloj = typeof momento === "string" ? Temporal.Instant.from(momento) : momento;
		},
		procesar,
		vueltaDelReloj,
		noche: async () => {
			await procesar();
			const { rows } = await servidor.base.dueno.query(
				"SELECT valor_texto FROM parametros WHERE clave = 'inventario.hora_cuadre'",
			);
			const hora = z.object({ valor_texto: z.string() }).parse(rows[0]).valor_texto;
			// El día que sigue al de la hora del worker, a la hora del cuadre más un minuto.
			const manana = reloj.toZonedDateTimeISO(zonaDelNegocio).toPlainDate().add({ days: 1 });
			reloj = manana
				.toZonedDateTime({ timeZone: zonaDelNegocio, plainTime: Temporal.PlainTime.from(hora) })
				.add({ minutes: 1 })
				.toInstant();
			await vueltaDelReloj();
			const fecha = manana.subtract({ days: 1 }).toString();
			const cuadre = await servidor.base.dueno.query(
				`SELECT fecha::text, estado, proyecciones_corregidas, diferencias_creadas, excepciones_creadas, error
				 FROM cuadres WHERE fecha = $1`,
				[fecha],
			);
			return z
				.object({
					fecha: z.string(),
					estado: z.string(),
					proyecciones_corregidas: z.number(),
					diferencias_creadas: z.number(),
					excepciones_creadas: z.number(),
					error: z.string().nullable(),
				})
				.parse(cuadre.rows[0]);
		},
		fallidas,
	};
}
