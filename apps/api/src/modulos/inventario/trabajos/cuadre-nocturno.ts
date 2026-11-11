/**
 * `inventario.cuadre_nocturno`: el cuadre de la noche del día de negocio que terminó.
 * Fase 9 · docs/modulos/inventario/existencias-y-cuadre.md («El trabajo «Cuadre nocturno»», «El aviso
 * `cuadre_fallido`»)
 *
 * Corre cada día a `inventario.hora_cuadre`, hora de México. Una sola corrida por fecha: si ya corrió, no hace nada.
 * Si no termina, avisa a la dueña con `cuadre_fallido` (el error va en el renglón del cuadre) y falla, para que
 * soporte reciba su `trabajo_fallido`. Al terminar, su evento encola la depuración de eventos.
 */

import { Temporal } from "temporal-polyfill";
import type { Horario, Trabajo } from "../../../nucleo/modulos.ts";
import { leerParametro } from "../../../nucleo/parametros.ts";
import { correrCuadre, diaQueTermino } from "../internas/correr-cuadre.ts";
import { tiposDeAvisoDeInventario } from "../tablas.ts";

/** El aviso de un cuadre que no terminó. */
const [cuadreFallido] = tiposDeAvisoDeInventario;

export const cuadreNocturno: Trabajo = {
	nombre: "inventario.cuadre_nocturno",
	horario: async (contexto): Promise<Horario> => ({
		cada: "dia",
		hora: String(await leerParametro(contexto.base, { clave: "inventario.hora_cuadre" })),
	}),
	correr: async (contexto) => {
		const fecha = diaQueTermino(contexto.ahora);
		try {
			await correrCuadre(contexto, fecha);
		} catch (error) {
			const dia = Temporal.PlainDate.from(fecha).toLocaleString("es-MX", { day: "numeric", month: "long" });
			await contexto.enTransaccion((accion) =>
				accion.interna("admin.crear_aviso", {
					tipo: cuadreFallido,
					destinatarios: { regla: "duena" },
					texto: `El cuadre de inventario del ${dia} no terminó. Soporte ya lo está revisando.`,
				}),
			);
			throw error;
		}
	},
};
