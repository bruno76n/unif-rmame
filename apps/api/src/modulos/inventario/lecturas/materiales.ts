/**
 * Las lecturas de material que usa la cuenta de cada material de Compras: lo que hay en Bodega y en Aduana de
 * muchos materiales a la vez, y sus salidas por día para el consumo medido.
 * Fase 10 · docs/modulos/compras/proyeccion-de-material.md (reglas 1 y 6, «El consumo») y
 * docs/modulos/inventario/libro-de-movimientos.md («Los tipos de movimiento»)
 *
 * Las dos leen en una sola consulta todos los materiales que se piden: la cuenta corre para todos los activos.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { existenciasMaterial, ubicaciones } from "../tablas.ts";

/** Lo que recibe `inventario.existencias_de_materiales`. */
const pedidoDeExistencias = z.object({ material_ids: z.array(z.uuid()) }).strict();

/**
 * `inventario.existencias_de_materiales`: lo que hay de cada material en Bodega y en Aduana, todos sus rollos
 * juntos, en su unidad de inventario.
 * @param contexto El contexto de quien lee.
 * @param datos `material_ids`.
 * @returns Por material pedido, `bodega` y `aduana` como texto decimal («700.000»); un material sin existencia,
 * en ceros.
 */
export async function existenciasDeMateriales(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<Record<string, { bodega: string; aduana: string }>> {
	const { material_ids } = pedidoDeExistencias.parse(datos);
	const resultado: Record<string, { bodega: string; aduana: string }> = Object.fromEntries(
		material_ids.map((id) => [id, { bodega: "0.000", aduana: "0.000" }]),
	);
	if (material_ids.length === 0) return resultado;
	// La suma se hace en la base, en `numeric`: nunca pasa por un número con decimales.
	const filas = await contexto.transaccion
		.select({
			materialId: existenciasMaterial.materialId,
			tipo: ubicaciones.tipo,
			cantidad: sql<string>`sum(${existenciasMaterial.cantidad})::numeric(12, 3)::text`,
		})
		.from(existenciasMaterial)
		.innerJoin(ubicaciones, eq(ubicaciones.id, existenciasMaterial.ubicacionId))
		.where(and(inArray(existenciasMaterial.materialId, material_ids), inArray(ubicaciones.tipo, ["bodega", "aduana"])))
		.groupBy(existenciasMaterial.materialId, ubicaciones.tipo);
	for (const fila of filas) {
		const suyo = resultado[fila.materialId];
		if (suyo === undefined) continue;
		if (fila.tipo === "bodega") suyo.bodega = fila.cantidad;
		else suyo.aduana = fila.cantidad;
	}
	return resultado;
}

/** Lo que recibe `inventario.salidas_de_materiales`. */
const pedidoDeSalidas = z.object({ material_ids: z.array(z.uuid()), desde: z.iso.date() }).strict();

/**
 * Los tipos que cuentan como salida para el consumo, con su signo: la tela y los avíos que se entregaron al corte
 * menos lo que regresó (rollos y retazos), y los consumibles que tomó el taller.
 */
const signoDeSalida = { entrega_corte: 1, consumible_tomado: 1, regreso_rollo: -1, regreso_retazo: -1 } as const;

/**
 * `inventario.salidas_de_materiales`: las salidas de cada material por día, desde un día, y el día de su primera
 * salida. Una reversión cuenta al revés que lo que revierte.
 * @param contexto El contexto de quien lee.
 * @param datos `material_ids` y `desde` (ISO).
 * @returns Por material pedido, `primera` (el día de su primera entrega al corte o consumible tomado, o `null`) y
 * `por_dia` (día → cantidad en su unidad de inventario, como texto decimal; puede ser negativa si regresó más).
 */
export async function salidasDeMateriales(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<Record<string, { primera: string | null; por_dia: Record<string, string> }>> {
	const { material_ids, desde } = pedidoDeSalidas.parse(datos);
	const resultado: Record<string, { primera: string | null; por_dia: Record<string, string> }> = Object.fromEntries(
		material_ids.map((id) => [id, { primera: null, por_dia: {} }]),
	);
	if (material_ids.length === 0) return resultado;
	const signos = sql.join(
		Object.entries(signoDeSalida).map(([tipo, signo]) => sql`WHEN ${tipo} THEN ${sql.raw(String(signo))}`),
		sql` `,
	);
	const tipos = sql.join(
		Object.keys(signoDeSalida).map((tipo) => sql`${tipo}`),
		sql`, `,
	);
	const ids = sql.join(
		material_ids.map((id) => sql`${id}::uuid`),
		sql`, `,
	);
	// Cada renglón con el tipo de lo que mueve: el suyo, o el del movimiento que revierte, con el signo al revés.
	const { rows } = await contexto.transaccion.execute<{ material_id: string; fecha: string; cantidad: string }>(sql`
		WITH renglones AS (
			SELECT l.material_id, m.fecha, coalesce(o.tipo, m.tipo) AS tipo,
				CASE WHEN m.tipo = 'reversion' THEN -1 ELSE 1 END AS sentido, l.cantidad
			FROM movimiento_lineas l
			JOIN movimientos m ON m.id = l.movimiento_id
			LEFT JOIN movimientos o ON o.id = m.revierte_movimiento_id
			WHERE l.material_id IN (${ids})
		)
		SELECT material_id, fecha::text AS fecha,
			sum(sentido * cantidad * CASE tipo ${signos} END)::numeric(12, 3)::text AS cantidad
		FROM renglones WHERE tipo IN (${tipos}) AND fecha >= ${desde}::date
		GROUP BY material_id, fecha`);
	for (const fila of rows) {
		const suyo = resultado[fila.material_id];
		if (suyo !== undefined) suyo.por_dia[fila.fecha] = fila.cantidad;
	}
	const { rows: primeras } = await contexto.transaccion.execute<{ material_id: string; primera: string }>(sql`
		SELECT l.material_id, min(m.fecha)::text AS primera
		FROM movimiento_lineas l JOIN movimientos m ON m.id = l.movimiento_id
		WHERE l.material_id IN (${ids}) AND m.tipo IN ('entrega_corte', 'consumible_tomado')
		GROUP BY l.material_id`);
	for (const fila of primeras) {
		const suyo = resultado[fila.material_id];
		if (suyo !== undefined) suyo.primera = fila.primera;
	}
	return resultado;
}
