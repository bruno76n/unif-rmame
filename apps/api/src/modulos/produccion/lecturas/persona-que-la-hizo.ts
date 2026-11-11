/**
 * `produccion.persona_que_la_hizo`: la persona que se propone para una pieza con defecto.
 * Fase 13 · docs/modulos/produccion/registros-de-operacion.md («Lecturas») y docs/modulos/calidad/revision-de-lotes.md
 * (regla 3)
 */

import { sql } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";

/** La persona que regresa. */
const laPersona = z.object({ persona_id: z.uuid(), nombre: z.string() });

/**
 * La persona con más piezas buenas vigentes de esa operación en los bultos de esa talla del lote (si empatan, la del
 * primer registro); si no hay registros, la que hace de base la operación.
 * @param datos `lote_id`, `flujo_operacion_id` y `variante_id`.
 * @returns La persona y su nombre, o vacío si la operación no existe.
 */
export async function personaQueLaHizo(contexto: ContextoDeAccion, datos: unknown) {
	const { lote_id, flujo_operacion_id, variante_id } = z
		.object({ lote_id: z.uuid(), flujo_operacion_id: z.uuid(), variante_id: z.uuid() })
		.parse(datos);
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT r.persona_id, p.nombre
		FROM registros_operacion r JOIN bultos b ON b.id = r.bulto_id JOIN personas p ON p.id = r.persona_id
		WHERE r.lote_id = ${lote_id} AND r.flujo_operacion_id = ${flujo_operacion_id} AND b.variante_id = ${variante_id}
			AND r.estado = 'vigente'
		GROUP BY r.persona_id, p.nombre
		HAVING sum(r.piezas_buenas) > 0
		ORDER BY sum(r.piezas_buenas) DESC, min(r.hecho_en)
		LIMIT 1`);
	if (rows[0] !== undefined) return laPersona.parse(rows[0]);
	const { rows: deBase } = await contexto.transaccion.execute(sql`
		SELECT f.persona_base_id AS persona_id, p.nombre FROM flujo_operaciones f JOIN personas p ON p.id = f.persona_base_id
		WHERE f.id = ${flujo_operacion_id}`);
	return deBase[0] === undefined ? null : laPersona.parse(deBase[0]);
}
