/**
 * El worker por dentro: la lista de tareas de Graphile Worker, el contexto de cada trabajo y cómo corre
 * una vuelta.
 * Fase 4 · docs/cimientos/EVENTOS-Y-TRABAJOS.md («El worker»)
 *
 * Tres tareas son del núcleo: `procesar_eventos`, `reloj` (cada minuto, por el `crontab`) y, por cada
 * trabajo que registró un módulo, la suya con su nombre (`admin.depurar_eventos`). Un trabajo programado
 * corre con el periodo de su vuelta: si esa vuelta ya terminó no hace nada; si termina bien la marca; si
 * falla anota el error, avisa a soporte la primera vez y la siguiente vuelta del reloj lo vuelve a encolar.
 */

import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { Task, TaskList } from "graphile-worker";
import { Temporal } from "temporal-polyfill";
import { trabajosVueltas } from "../../modulos/admin/tablas.ts";
import { crearContexto, type ServiciosDelCorredor } from "../acciones/corredor.ts";
import type { Base } from "../base/conexion.ts";
import { enTransaccion } from "../base/transacciones.ts";
import type { ContextoDeTrabajo, RegistroDeModulos, Trabajo } from "../modulos.ts";
import { procesarEventos, repartirConLosModulos } from "./procesar-eventos.ts";
import { correrReloj } from "./reloj.ts";

/** Lo que necesita el worker. */
export interface DependenciasDelTrabajador {
	base: Base;
	registro: RegistroDeModulos;
	/** La bitácora y los eventos de lo que escriben los trabajos, como en una acción. */
	servicios: ServiciosDelCorredor;
	/** Avisa a soporte que algo del worker falló. */
	avisarFalla: (texto: string) => Promise<void>;
	/** La hora; en las pruebas, una controlada. */
	reloj?: () => Temporal.Instant;
}

/** El `crontab` de Graphile Worker: el reloj, cada minuto. */
export const crontabDelTrabajador = "* * * * * reloj";

/**
 * Arma el contexto de un trabajo.
 * @param dependencias Lo que necesita el worker.
 * @param trabajo El nombre del trabajo.
 * @param carga El periodo de su vuelta o el evento que lo encoló.
 */
export function contextoDeTrabajo(
	dependencias: DependenciasDelTrabajador,
	trabajo: string,
	carga: { periodo?: string | undefined; eventoId?: string | undefined } = {},
): ContextoDeTrabajo {
	const ahora = (dependencias.reloj ?? (() => Temporal.Now.instant()))();
	return {
		base: dependencias.base,
		ahora,
		periodo: carga.periodo,
		eventoId: carga.eventoId,
		enTransaccion: (hacer) =>
			enTransaccion(dependencias.base, async (transaccion) => {
				const quien = { tipo: "sistema", trabajo } as const;
				const { contexto, renglones, eventos } = crearContexto(
					dependencias.registro,
					transaccion,
					quien,
					trabajo,
					ahora,
					undefined,
				);
				const resultado = await hacer(contexto);
				await dependencias.servicios.escribirBitacora(contexto, renglones);
				await dependencias.servicios.guardarEventos(contexto, eventos);
				return resultado;
			}),
	};
}

/** Lee un texto de la carga de una tarea. */
function textoDeLaCarga(carga: unknown, llave: string): string | undefined {
	if (typeof carga !== "object" || carga === null || !(llave in carga)) return undefined;
	const valor: unknown = Reflect.get(carga, llave);
	return typeof valor === "string" ? valor : undefined;
}

/**
 * Corre un trabajo. Si es una vuelta programada, primero revisa que no haya terminado y al final la marca
 * terminada; si falla, anota el error y avisa a soporte la primera vez.
 * @param dependencias Lo que necesita el worker.
 * @param trabajo El trabajo.
 * @param carga Lo que traía la tarea: `periodo` o `evento_id`.
 */
export async function correrTrabajo(
	dependencias: DependenciasDelTrabajador,
	trabajo: Trabajo,
	carga: unknown,
): Promise<void> {
	const periodo = textoDeLaCarga(carga, "periodo");
	const contexto = contextoDeTrabajo(dependencias, trabajo.nombre, {
		periodo,
		eventoId: textoDeLaCarga(carga, "evento_id"),
	});
	if (periodo === undefined) return trabajo.correr(contexto);
	const vuelta = and(eq(trabajosVueltas.trabajo, trabajo.nombre), eq(trabajosVueltas.periodo, periodo));
	const [terminada] = await dependencias.base
		.select({ trabajo: trabajosVueltas.trabajo })
		.from(trabajosVueltas)
		.where(and(vuelta, isNotNull(trabajosVueltas.terminadoEn)));
	if (terminada !== undefined) return;
	try {
		await trabajo.correr(contexto);
	} catch (error) {
		const [fallida] = await dependencias.base
			.update(trabajosVueltas)
			.set({
				intentos: sql`${trabajosVueltas.intentos} + 1`,
				ultimoError: error instanceof Error ? error.message : String(error),
			})
			.where(vuelta)
			.returning({ intentos: trabajosVueltas.intentos });
		if (fallida?.intentos === 1) await dependencias.avisarFalla(`El trabajo ${trabajo.nombre} falló (${periodo})`);
		throw error;
	}
	await dependencias.base.update(trabajosVueltas).set({ terminadoEn: sql`now()` }).where(vuelta);
}

/**
 * La lista de tareas de Graphile Worker: las del núcleo y una por cada trabajo de los módulos.
 * @param dependencias Lo que necesita el worker.
 */
export function listaDeTareas(dependencias: DependenciasDelTrabajador): TaskList {
	const ahora = () => (dependencias.reloj ?? (() => Temporal.Now.instant()))();
	const tareas: Record<string, Task> = {
		procesar_eventos: async () => {
			await procesarEventos({
				base: dependencias.base,
				repartir: repartirConLosModulos(dependencias.registro),
				avisarFalla: dependencias.avisarFalla,
				ahora,
			});
		},
		reloj: async () => {
			await correrReloj(dependencias.registro.trabajos.values(), contextoDeTrabajo(dependencias, "reloj"));
		},
	};
	for (const trabajo of dependencias.registro.trabajos.values()) {
		tareas[trabajo.nombre] = (carga) => correrTrabajo(dependencias, trabajo, carga);
	}
	return tareas;
}
