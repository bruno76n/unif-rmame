/**
 * `produccion.vigilar_lotes_atorados`: cada hora, en los días de trabajo, avisa a la dueña del lote que entra a
 * atorado.
 * Fase 12 · docs/modulos/produccion/lotes.md (regla 7, «Vigilar lotes atorados», «El aviso `lote_atorado`»)
 *
 * Los atorados salen de `lotesAtoradosDeHoy` (`dominio/lotes-atorados.ts`), lo mismo que lee Dirección. Un lote atorado
 * avisa una vez: guarda `lote.atorado` solo si no hay otro de ese lote después de su último registro o de la falla que
 * lo detiene.
 */

import { diaDeNegocio } from "@uniformame/compartido/calculos/fechas";
import { and, eq, gt } from "drizzle-orm";
import type { ContextoDeAccion, Trabajo } from "../../../nucleo/modulos.ts";
import { leerParametro } from "../../../nucleo/parametros.ts";
import { eventos } from "../../admin/tablas.ts";
import { leerDiasDeTrabajo } from "../../personal/dominio/asistencia.ts";
import { lotesAtoradosDeHoy } from "../dominio/lotes-atorados.ts";
import { tiposDeAvisoDeProduccion } from "../tablas.ts";

/** El aviso del lote atorado. */
const [loteAtorado] = tiposDeAvisoDeProduccion;

/**
 * Revisa los lotes en proceso y avisa de los que entraron a atorado.
 * @param contexto La transacción del trabajo, con el sistema como quien escribe.
 * @returns Cuántos avisos nacieron.
 */
export async function vigilar(contexto: ContextoDeAccion): Promise<number> {
	const { transaccion } = contexto;
	let avisos = 0;
	for (const lote of await lotesAtoradosDeHoy(contexto)) {
		// Avisa una vez hasta que algo cambia: ningún `lote.atorado` de este lote después de su último registro o de la
		// falla que lo detiene.
		const desde = [lote.ultimo_recibido, lote.parada_desde]
			.filter((momento): momento is string => momento !== null)
			.sort()
			.at(-1);
		const [yaAviso] = await transaccion
			.select({ id: eventos.id })
			.from(eventos)
			.where(
				and(
					eq(eventos.tipo, "lote.atorado"),
					eq(eventos.entidadId, lote.lote_id),
					...(desde === undefined ? [] : [gt(eventos.ocurridoEn, desde)]),
				),
			)
			.limit(1);
		if (yaAviso !== undefined) continue;
		contexto.guardarEvento({
			tipo: "lote.atorado",
			datos: {
				lote_id: lote.lote_id,
				operacion: lote.operacion,
				dias: lote.dias,
				...(lote.falla === null ? {} : { falla: lote.falla }),
			},
			tablas: ["lotes"],
			entidad: "lotes",
			entidadId: lote.lote_id,
			entidadFolio: lote.folio,
		});
		await contexto.interna("admin.crear_aviso", {
			tipo: loteAtorado,
			destinatarios: { regla: "duena" },
			// Por máquina, el aviso dice la máquina parada en vez de los días (decisión 627).
			texto:
				lote.falla === null
					? `${lote.folio} atorado en ${lote.operacion} desde hace ${lote.dias} días de trabajo`
					: `${lote.folio} atorado en ${lote.operacion}: ${lote.falla}`,
			entidad: "lotes",
			entidadId: lote.lote_id,
		});
		avisos++;
	}
	return avisos;
}

export const vigilarLotesAtorados: Trabajo = {
	nombre: "produccion.vigilar_lotes_atorados",
	horario: async () => ({ cada: "minutos", minutos: 60 }),
	correr: async (contexto) => {
		const hoy = diaDeNegocio(contexto.ahora);
		const dias = leerDiasDeTrabajo(await leerParametro(contexto.base, { clave: "general.dias_de_trabajo" }));
		if (!dias.some((dia) => dia === hoy.dayOfWeek)) return;
		await contexto.enTransaccion(vigilar);
	},
};
