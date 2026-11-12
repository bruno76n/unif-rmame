/**
 * Las lecturas de la revisión de lotes: lo aprobado de un lote para Aduana y lo que un pedido tiene en reproceso.
 * Fase 13 · docs/modulos/calidad/revision-de-lotes.md («Lecturas»)
 * Fase 14 · lo que Aduana lee de un reproceso al recibirlo
 */

import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { lotes } from "../../produccion/tablas.ts";
import { rechazos, reprocesos, revisiones, revisionTallas } from "../tablas.ts";

/**
 * `calidad.aprobadas_del_lote`: la revisión de un lote, sus aprobadas congeladas por talla y sus reprocesos. Aduana
 * cuenta a ciegas contra ellas (fase 14).
 * @param datos `lote_id`.
 * @returns La revisión, o vacío si el lote no se ha revisado.
 */
export async function aprobadasDelLote(contexto: ContextoDeAccion, datos: unknown) {
	const { lote_id } = z.object({ lote_id: z.uuid() }).parse(datos);
	const { transaccion } = contexto;
	const [revision] = await transaccion
		.select({ id: revisiones.id })
		.from(revisiones)
		.where(eq(revisiones.loteId, lote_id));
	if (revision === undefined) return null;
	const tallas = await transaccion
		.select({ variante_id: revisionTallas.varianteId, piezas_aprobadas: revisionTallas.piezasAprobadas })
		.from(revisionTallas)
		.where(eq(revisionTallas.revisionId, revision.id))
		.orderBy(asc(revisionTallas.varianteId));
	const suyos = await transaccion
		.select({
			reproceso_id: reprocesos.id,
			folio: reprocesos.folio,
			variante_id: rechazos.varianteId,
			estado: reprocesos.estado,
			piezas: rechazos.piezas,
			piezas_aprobadas: reprocesos.piezasAprobadas,
		})
		.from(reprocesos)
		.innerJoin(rechazos, eq(rechazos.id, reprocesos.rechazoId))
		.where(eq(reprocesos.loteId, lote_id))
		.orderBy(asc(reprocesos.folio));
	return { revision_id: revision.id, tallas, reprocesos: suyos };
}

/**
 * `calidad.en_reproceso_de_pedido`: las piezas en reproceso de los lotes de un pedido, por lote y talla. Producción
 * las suma a lo que el pedido tiene en producción solo de los lotes que ya llegaron a aduana: antes, siguen contadas en
 * el lote (decisión 621).
 * @param datos `pedido_id`.
 */
export async function enReprocesoDePedido(contexto: ContextoDeAccion, datos: unknown) {
	const { pedido_id } = z.object({ pedido_id: z.uuid() }).parse(datos);
	const filas = await contexto.transaccion
		.select({
			lote_id: reprocesos.loteId,
			variante_id: rechazos.varianteId,
			piezas: sql<number>`sum(${rechazos.piezas})::int`,
		})
		.from(reprocesos)
		.innerJoin(rechazos, eq(rechazos.id, reprocesos.rechazoId))
		.innerJoin(lotes, eq(lotes.id, reprocesos.loteId))
		.where(and(eq(lotes.pedidoId, pedido_id), eq(reprocesos.estado, "en_reproceso")))
		.groupBy(reprocesos.loteId, rechazos.varianteId)
		.orderBy(asc(reprocesos.loteId), asc(rechazos.varianteId));
	return { reprocesos: filas };
}

/**
 * `calidad.reproceso_para_aduana`: lo que Aduana necesita de un reproceso para recibirlo a ciegas: su folio, su lote,
 * su talla, su estado y sus piezas aprobadas (que no regresan a la pantalla de Aduana).
 * Fase 14 · docs/modulos/calidad/revision-de-lotes.md («`calidad.reproceso_para_aduana(reproceso)`»)
 * @param datos `reproceso_id`.
 * @returns El reproceso, o `null` si no existe.
 */
export async function reprocesoParaAduana(contexto: ContextoDeAccion, datos: unknown) {
	const { reproceso_id } = z.object({ reproceso_id: z.uuid() }).parse(datos);
	const [reproceso] = await contexto.transaccion
		.select({
			reproceso_id: reprocesos.id,
			folio: reprocesos.folio,
			lote_id: reprocesos.loteId,
			variante_id: rechazos.varianteId,
			estado: reprocesos.estado,
			piezas_aprobadas: reprocesos.piezasAprobadas,
		})
		.from(reprocesos)
		.innerJoin(rechazos, eq(rechazos.id, reprocesos.rechazoId))
		.where(eq(reprocesos.id, reproceso_id));
	return reproceso ?? null;
}
