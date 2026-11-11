/**
 * `inventario.cuadre_nocturno`: el cuadre de la noche del día de negocio que terminó.
 * Fase 9 · docs/modulos/inventario/existencias-y-cuadre.md («El trabajo «Cuadre nocturno»», «El aviso
 * `cuadre_fallido`»)
 *
 * Corre cada día a `inventario.hora_cuadre`, hora de México. Una sola corrida por fecha: si ya corrió, no hace nada.
 * Si no termina, avisa a la dueña con `cuadre_fallido` (el error va en el renglón del cuadre) y falla, para que
 * soporte reciba su `trabajo_fallido`. Si al volver a correr encuentra el de esa fecha todavía `corriendo` (su
 * proceso se cortó), lo deja en `fallo` y avisa igual. Al terminar, su evento encola la depuración de eventos.
 */

import { eq } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import type { Horario, Trabajo } from "../../../nucleo/modulos.ts";
import { leerParametro } from "../../../nucleo/parametros.ts";
import { correrCuadre, diaQueTermino, marcarCuadreCortado } from "../internas/correr-cuadre.ts";
import { cuadres, tiposDeAvisoDeInventario } from "../tablas.ts";

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
		// El aviso va ligado a su cuadre: cada noche que no termina avisa, aunque el de otra noche siga sin leer.
		const avisar = () => {
			const dia = Temporal.PlainDate.from(fecha).toLocaleString("es-MX", { day: "numeric", month: "long" });
			return contexto.enTransaccion(async (accion) => {
				const [cuadre] = await accion.transaccion
					.select({ id: cuadres.id })
					.from(cuadres)
					.where(eq(cuadres.fecha, fecha));
				await accion.interna("admin.crear_aviso", {
					tipo: cuadreFallido,
					destinatarios: { regla: "duena" },
					texto: `El cuadre de inventario del ${dia} no terminó. Soporte ya lo está revisando.`,
					...(cuadre === undefined ? {} : { entidad: "cuadres", entidadId: cuadre.id }),
				});
			});
		};
		try {
			const corrido = await correrCuadre(contexto, fecha);
			if (!("yaCorrio" in corrido) || corrido.estado !== "corriendo") return;
			await marcarCuadreCortado(contexto, corrido.cuadreId, fecha);
		} catch (error) {
			await avisar();
			throw error;
		}
		await avisar();
		throw new Error(`el cuadre del ${fecha} se cortó sin terminar`);
	},
};
