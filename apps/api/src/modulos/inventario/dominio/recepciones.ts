/**
 * Lo que comparten la recepción de proveedor, su recepción de más y la lectura de lo recibido: la ubicación de un
 * tipo, el candado de una orden, lo recibido de cada línea y las recepciones de cada orden.
 * Fase 11 · docs/modulos/inventario/recepciones-en-aduana.md (reglas 3, 4, 5 y 9; «Lecturas»)
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { ubicaciones } from "../tablas.ts";

/**
 * El id de la ubicación de un tipo que solo tiene una (Aduana, Bodega, el Taller, Tránsito).
 * @param transaccion La transacción.
 * @param tipo `aduana`, `bodega`, `taller` o `transito`.
 * @throws Error si no existe: la siembra la crea.
 */
export async function ubicacionDeTipo(
	transaccion: Transaccion,
	tipo: "aduana" | "bodega" | "taller" | "transito",
): Promise<string> {
	const [ubicacion] = await transaccion
		.select({ id: ubicaciones.id })
		.from(ubicaciones)
		.where(and(eq(ubicaciones.tipo, tipo), isNull(ubicaciones.bajaEn)));
	if (ubicacion === undefined) throw new Error(`no hay ubicación ${tipo}`);
	return ubicacion.id;
}

/**
 * Toma el candado de lo recibido de una orden: dos recepciones a la vez, o una recepción y la decisión de lo de más,
 * se esperan, así cada una ve lo que la otra dejó al contar lo de más.
 * @param contexto El contexto de la acción.
 * @param ordenCompraId La orden.
 */
export async function candadoDeLoRecibido(contexto: ContextoDeAccion, ordenCompraId: string): Promise<void> {
	await contexto.transaccion.execute(
		sql`SELECT pg_advisory_xact_lock(hashtextextended(${`recepcion_orden:${ordenCompraId}`}, 0))`,
	);
}

/**
 * Lo recibido de unas líneas de órdenes: lo contado en sus recepciones de proveedor menos lo rechazado que regresa
 * al proveedor (las devoluciones de esa orden y ese material que no se cancelaron). Una línea es única por orden y
 * material, así que su devolución se encuentra por los dos.
 * @param transaccion La transacción.
 * @param lineaIds Las líneas.
 * @returns Por línea con recepciones, lo recibido en su unidad, como texto decimal; las demás no vienen.
 */
export async function recibidoDeLineas(
	transaccion: Transaccion,
	lineaIds: readonly string[],
): Promise<Record<string, string>> {
	if (lineaIds.length === 0) return {};
	const ids = sql.join(
		lineaIds.map((id) => sql`${id}::uuid`),
		sql`, `,
	);
	const { rows } = await transaccion.execute<{ linea: string; recibido: string }>(sql`
		WITH contado AS (
			SELECT rl.orden_compra_linea_id AS linea, r.orden_compra_id AS orden, rl.material_id AS material,
				sum(rl.cantidad_contada) AS cantidad
			FROM recepcion_lineas rl JOIN recepciones r ON r.id = rl.recepcion_id
			WHERE r.tipo = 'aduana_de_proveedor' AND rl.orden_compra_linea_id IN (${ids})
			GROUP BY 1, 2, 3
		)
		SELECT c.linea, (c.cantidad - coalesce((
			SELECT sum(tl.cantidad_enviada) FROM traspaso_lineas tl JOIN traspasos t ON t.id = tl.traspaso_id
			WHERE t.tipo = 'devolucion_proveedor' AND t.estado <> 'cancelado'
				AND t.orden_compra_id = c.orden AND tl.material_id = c.material
		), 0))::numeric(12, 3)::text AS recibido
		FROM contado c`);
	return Object.fromEntries(rows.map((fila) => [fila.linea, fila.recibido]));
}

/**
 * Las recepciones de proveedor de unas órdenes, cada una con su día (en hora de México), en el orden en que llegaron.
 * @param transaccion La transacción.
 * @param ordenIds Las órdenes.
 */
export async function recepcionesDeOrdenes(
	transaccion: Transaccion,
	ordenIds: readonly string[],
): Promise<Record<string, { recepcion_id: string; dia: string }[]>> {
	if (ordenIds.length === 0) return {};
	const ids = sql.join(
		ordenIds.map((id) => sql`${id}::uuid`),
		sql`, `,
	);
	const { rows } = await transaccion.execute<{ orden: string; id: string; dia: string }>(sql`
		SELECT orden_compra_id AS orden, id, (recibido_en AT TIME ZONE 'America/Mexico_City')::date::text AS dia
		FROM recepciones WHERE tipo = 'aduana_de_proveedor' AND orden_compra_id IN (${ids})
		ORDER BY recibido_en, id`);
	const porOrden: Record<string, { recepcion_id: string; dia: string }[]> = {};
	for (const fila of rows) {
		const suyas = porOrden[fila.orden] ?? [];
		suyas.push({ recepcion_id: fila.id, dia: fila.dia });
		porOrden[fila.orden] = suyas;
	}
	return porOrden;
}
