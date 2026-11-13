/**
 * `admin.valores_de_lista`: los valores vigentes de una lista de Configuración, en su orden, para los selectores de
 * los demás módulos (las cuentas de la fábrica, las categorías de gasto, las áreas del taller…).
 * Fase 19 · docs/modulos/admin/configuracion.md («Las listas»)
 */

import { sql } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";

/** Lo que recibe. */
const pedido = z.object({
	lista: z.string().min(1),
	/** Sin los que pone el sistema y no se escogen a mano («Reparación de máquinas»). */
	solo_seleccionables: z.boolean().optional(),
});

/**
 * Lee los valores vigentes de una lista.
 * @param contexto El contexto de quien lee.
 * @param datos `lista` (su clave) y `solo_seleccionables` (opcional).
 * @returns `{ valores: [{ id, nombre }] }`, por su orden y luego por nombre.
 */
export async function valoresDeLista(contexto: ContextoDeAccion, datos: unknown) {
	const { lista, solo_seleccionables: soloSeleccionables = false } = pedido.parse(datos);
	const { rows } = await contexto.transaccion.execute(sql`SELECT v.id, v.nombre FROM lista_valores v
		JOIN listas l ON l.id = v.lista_id
		WHERE l.clave = ${lista} AND v.baja_en IS NULL AND (${!soloSeleccionables} OR v.seleccionable)
		ORDER BY v.orden, v.nombre`);
	return { valores: z.array(z.object({ id: z.uuid(), nombre: z.string() })).parse(rows) };
}
