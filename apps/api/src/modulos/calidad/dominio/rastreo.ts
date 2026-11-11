/**
 * El rastreo de un reclamo: del lote a quién lo revisó, la operación y su persona, los rollos de su corte con su partida,
 * su tela y su proveedor, y en cuántos lotes se hizo la prenda.
 * Fase 13 · docs/modulos/calidad/reclamos-y-devoluciones.md (regla 5)
 *
 * Se calcula, no se guarda: lo lee de las tablas de Producción, Inventario y Compras, sin costos ni tarifas.
 */

import { sql } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";

/** Lo que dice el rastreo. */
const delRastreo = z.object({
	lote: z.string(),
	revisado_por: z.string().nullable(),
	revisado_en: z.string().nullable(),
	operacion: z.string(),
	persona: z.string().nullable(),
	lotes_de_la_prenda: z.number(),
});

/** Un rollo del corte del lote. */
const delRollo = z.object({
	rollo: z.string(),
	partida: z.string().nullable(),
	tela: z.string(),
	proveedor: z.string().nullable(),
});

/**
 * Arma el rastreo de un reclamo.
 * @param reclamo El lote, la operación y la persona del reclamo.
 * @returns El rastreo; si el lote mezcló partidas, salen todos sus rollos.
 */
export async function rastreoDeReclamo(
	contexto: ContextoDeAccion,
	reclamo: { loteId: string; flujoOperacionId: string; personaId: string | null },
) {
	const { transaccion } = contexto;
	const { rows } = await transaccion.execute(sql`
		SELECT l.folio AS lote,
			coalesce(pr.nombre, u.nombre, u.correo) AS revisado_por,
			to_char(r.revisado_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS revisado_en,
			o.nombre AS operacion,
			(SELECT p.nombre FROM personas p WHERE p.id = ${reclamo.personaId}) AS persona,
			(SELECT count(*)::int FROM lotes otros WHERE otros.producto_id = l.producto_id AND otros.flujo_id IS NOT NULL
				AND otros.estado <> 'cancelado') AS lotes_de_la_prenda
		FROM lotes l
		LEFT JOIN revisiones r ON r.lote_id = l.id
		LEFT JOIN usuarios u ON u.id = r.revisado_por
		LEFT JOIN personas pr ON pr.id = u.persona_id
		JOIN flujo_operaciones f ON f.id = ${reclamo.flujoOperacionId}
		JOIN operaciones o ON o.id = f.operacion_id
		WHERE l.id = ${reclamo.loteId}`);
	const { rows: suyos } = await transaccion.execute(sql`
		SELECT ro.folio AS rollo, pt.folio AS partida, m.nombre AS tela, t.nombre AS proveedor
		FROM cortes c
		JOIN corte_telas ct ON ct.corte_id = c.id
		JOIN corte_rollos cr ON cr.corte_tela_id = ct.id
		JOIN rollos ro ON ro.id = cr.rollo_id
		JOIN materiales m ON m.id = ro.material_id
		LEFT JOIN partidas_tela pt ON pt.id = ro.partida_tela_id
		LEFT JOIN proveedores pv ON pv.id = coalesce(ro.proveedor_id, pt.proveedor_id)
		LEFT JOIN terceros t ON t.id = pv.tercero_id
		WHERE c.lote_id = ${reclamo.loteId}
		ORDER BY ct.papel, cr.orden`);
	return { ...delRastreo.parse(rows[0]), rollos: z.array(delRollo).parse(suyos) };
}
