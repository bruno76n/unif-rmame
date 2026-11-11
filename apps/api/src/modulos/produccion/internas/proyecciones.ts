/**
 * `produccion.recalcular_proyecciones`: el trabajo «Recalcular proyecciones de Producción», por tramos. Corrige las
 * terminadas y la merma de cada talla que no cuadran con sus registros vigentes; si con eso un lote en proceso queda
 * completo, lo termina como lo haría un registro.
 * Fase 12 · docs/modulos/produccion/lotes.md («Trabajos», «Recalcular proyecciones de Producción»)
 *
 * Lo corre el cuadre nocturno antes de sus pasos, un tramo de lotes por transacción. Repetible: corrige hacia lo que
 * dicen los registros, así que correrlo dos veces deja lo mismo.
 */

import { and, asc, eq, gt, isNotNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { subirVersion } from "../../../nucleo/acciones/pisadas.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { loteCompleto, terminarLote } from "../dominio/registros.ts";
import { lotes, loteTallas } from "../tablas.ts";

/** Lo que recibe: desde qué lote sigue el tramo y cuántos lleva. */
const tramo = z.object({ despues_de: z.uuid().optional(), limite: z.number().int().positive() });

/** Lo que dicen los registros vigentes de cada talla de un lote. */
const fila = z.object({ id: z.uuid(), terminadas: z.coerce.number(), merma: z.coerce.number() });

/**
 * Recalcula un tramo de lotes cortados.
 * @returns El último lote del tramo (para el siguiente, o vacío si no hubo) y cuántas tallas corrigió.
 */
export async function recalcularProyecciones(contexto: ContextoDeAccion, datos: unknown) {
	const { despues_de, limite } = tramo.parse(datos);
	const { transaccion } = contexto;
	const delTramo = await transaccion
		.select({ id: lotes.id, folio: lotes.folio, estado: lotes.estado })
		.from(lotes)
		.where(
			and(
				isNotNull(lotes.flujoId),
				ne(lotes.estado, "cancelado"),
				...(despues_de === undefined ? [] : [gt(lotes.id, despues_de)]),
			),
		)
		.orderBy(asc(lotes.id))
		.limit(limite)
		.for("update");
	let corregidas = 0;
	for (const lote of delTramo) {
		const antes = corregidas;
		// Por talla: la merma de todas las operaciones y las terminadas de la última, en sus bultos.
		const { rows } = await transaccion.execute(sqlDeLasTallas(lote.id));
		const reales = z.array(fila).parse(rows);
		const guardadas = await transaccion
			.select({ id: loteTallas.id, terminadas: loteTallas.piezasTerminadas, merma: loteTallas.piezasMerma })
			.from(loteTallas)
			.where(eq(loteTallas.loteId, lote.id));
		for (const guardada of guardadas) {
			const real = reales.find((suya) => suya.id === guardada.id) ?? { terminadas: 0, merma: 0 };
			if (real.terminadas === guardada.terminadas && real.merma === guardada.merma) continue;
			await transaccion
				.update(loteTallas)
				.set({ piezasTerminadas: real.terminadas, piezasMerma: real.merma })
				.where(eq(loteTallas.id, guardada.id));
			corregidas++;
			contexto.bitacora({
				descripcion: `Corrigió las proyecciones de ${lote.folio}`,
				entidad: "lote_tallas",
				entidadId: guardada.id,
				entidadFolio: lote.folio,
				antes: { terminadas: guardada.terminadas, merma: guardada.merma },
				despues: real,
			});
		}
		// El lote es un agregado con sus tallas: si alguna cambió, sube su versión.
		if (corregidas > antes) await subirVersion(transaccion, lotes, lote.id);
		if (lote.estado === "en_proceso" && (await loteCompleto(contexto, lote.id))) await terminarLote(contexto, lote);
	}
	if (corregidas > 0) {
		contexto.guardarEvento({
			tipo: "lote_tallas.corregidas",
			datos: { tallas: corregidas },
			tablas: ["lote_tallas", "lotes"],
		});
	}
	return { siguiente: delTramo.at(-1)?.id ?? null, corregidas };
}

/** La cuenta de cada talla de un lote desde sus registros vigentes. */
function sqlDeLasTallas(loteId: string) {
	return sql`
		SELECT lt.id,
			coalesce(sum(r.piezas_danadas) FILTER (WHERE r.estado = 'vigente'), 0) AS merma,
			coalesce(sum(r.piezas_buenas) FILTER (WHERE r.estado = 'vigente' AND r.flujo_operacion_id = (
				SELECT f.id FROM flujo_operaciones f WHERE f.flujo_id = l.flujo_id AND f.baja_en IS NULL ORDER BY f.orden DESC LIMIT 1
			)), 0) AS terminadas
		FROM lote_tallas lt
		JOIN lotes l ON l.id = lt.lote_id
		LEFT JOIN bultos b ON b.lote_id = lt.lote_id AND b.variante_id = lt.variante_id
		LEFT JOIN registros_operacion r ON r.bulto_id = b.id
		WHERE lt.lote_id = ${loteId}
		GROUP BY lt.id`;
}
