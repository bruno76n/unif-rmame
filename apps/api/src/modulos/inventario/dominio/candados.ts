/**
 * Los candados del inventario, en el orden fijo: primero el de cada variante, después los traspasos por id, los
 * renglones de `existencias` por (`ubicacion_id`, `variante_id`) y los de `existencias_material` por
 * (`ubicacion_id`, `material_id`, `rollo_id`, el rollo vacío primero). Una acción que hace varias cosas con el
 * inventario toma al principio, con `tomarCandadosDeInventario`, las variantes y los traspasos de todas.
 * Fase 9 · docs/cimientos/BASE-DE-DATOS.md («Candados») y docs/modulos/inventario/libro-de-movimientos.md
 * («Cómo se escribe un movimiento», paso 2)
 *
 * El candado de la variante lo toman los movimientos, las reservas y quien decide sobre la variante (la baja de
 * una talla): así ni un renglón de existencia que todavía no existe se cruza con ellos.
 */

import { sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";

/** Un renglón de `existencias`. */
export interface LugarDePrenda {
	ubicacionId: string;
	varianteId: string;
}

/** Un renglón de `existencias_material`: la tela con su rollo; los avíos y consumibles sin él. */
export interface LugarDeMaterial {
	ubicacionId: string;
	materialId: string;
	rolloId: string | null;
}

/** Compara dos textos como Postgres compara dos uuid: el texto en minúsculas sigue el orden de sus bytes. */
function comparar(uno: string, otro: string): number {
	return uno < otro ? -1 : uno > otro ? 1 : 0;
}

/**
 * Toma el candado de cada variante, en orden, hasta que termine la transacción.
 * @param transaccion La transacción.
 * @param varianteIds Las variantes; se quitan las repetidas.
 */
export async function candadoDeVariantes(transaccion: Transaccion, varianteIds: Iterable<string>): Promise<void> {
	for (const id of [...new Set(varianteIds)].sort(comparar)) {
		await transaccion.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`variante:${id}`}, 0))`);
	}
}

/**
 * Bloquea unos traspasos, en orden por id, después de las variantes y antes de las existencias. No cambia nada de
 * ellos: así un movimiento, un cambio de estado y un reparto del mismo traspaso se ponen en fila en el mismo orden.
 * @param transaccion La transacción.
 * @param traspasoIds Los traspasos; se quitan los repetidos.
 */
export async function bloquearTraspasos(transaccion: Transaccion, traspasoIds: Iterable<string>): Promise<void> {
	for (const id of [...new Set(traspasoIds)].sort(comparar)) {
		await transaccion.execute(sql`SELECT 1 FROM traspasos WHERE id = ${id} FOR NO KEY UPDATE`);
	}
}

/**
 * Bloquea los renglones de `existencias` en el orden fijo; los que no existen nacen en cero.
 * @param transaccion La transacción.
 * @param lugares Los renglones; se quitan los repetidos.
 * @returns Los lugares ordenados, sin repetir.
 */
export async function bloquearExistencias(
	transaccion: Transaccion,
	lugares: readonly LugarDePrenda[],
): Promise<LugarDePrenda[]> {
	const ordenados = [
		...new Map(lugares.map((lugar) => [`${lugar.ubicacionId}|${lugar.varianteId}`, lugar])).values(),
	].sort((uno, otro) => comparar(uno.ubicacionId, otro.ubicacionId) || comparar(uno.varianteId, otro.varianteId));
	for (const { ubicacionId, varianteId } of ordenados) {
		// Nace en cero si no estaba; si estaba, espera a quien lo tenga y luego lo bloquea.
		await transaccion.execute(sql`
			INSERT INTO existencias (id, ubicacion_id, variante_id) VALUES (${uuidv7()}, ${ubicacionId}, ${varianteId})
			ON CONFLICT (ubicacion_id, variante_id) DO NOTHING`);
		await transaccion.execute(sql`
			SELECT 1 FROM existencias WHERE ubicacion_id = ${ubicacionId} AND variante_id = ${varianteId} FOR UPDATE`);
	}
	return ordenados;
}

/**
 * Bloquea los renglones de `existencias_material` en el orden fijo; los que no existen nacen en cero.
 * @param transaccion La transacción.
 * @param lugares Los renglones; se quitan los repetidos.
 * @returns Los lugares ordenados, sin repetir.
 */
export async function bloquearExistenciasMaterial(
	transaccion: Transaccion,
	lugares: readonly LugarDeMaterial[],
): Promise<LugarDeMaterial[]> {
	const ordenados = [
		...new Map(lugares.map((lugar) => [`${lugar.ubicacionId}|${lugar.materialId}|${lugar.rolloId}`, lugar])).values(),
	].sort(
		(uno, otro) =>
			comparar(uno.ubicacionId, otro.ubicacionId) ||
			comparar(uno.materialId, otro.materialId) ||
			// El rollo vacío va primero, como en el `ORDER BY … rollo_id NULLS FIRST` del cuadre.
			comparar(uno.rolloId ?? "", otro.rolloId ?? ""),
	);
	for (const { ubicacionId, materialId, rolloId } of ordenados) {
		await transaccion.execute(sql`
			INSERT INTO existencias_material (id, ubicacion_id, material_id, rollo_id)
			VALUES (${uuidv7()}, ${ubicacionId}, ${materialId}, ${rolloId})
			ON CONFLICT ON CONSTRAINT existencias_material_lugar DO NOTHING`);
		await transaccion.execute(sql`
			SELECT 1 FROM existencias_material
			WHERE ubicacion_id = ${ubicacionId} AND material_id = ${materialId}
				AND rollo_id IS NOT DISTINCT FROM ${rolloId}::uuid
			FOR UPDATE`);
	}
	return ordenados;
}

/**
 * Toma al principio de una acción los candados de todo lo que va a tocar del inventario: sus variantes y, después,
 * sus traspasos. Lo que escriba luego (varios movimientos, un cambio de estado, un reparto) vuelve a pedirlos sin
 * esperar, y ya no puede invertir el orden con otra acción.
 * @param transaccion La transacción.
 * @param candados Las variantes y los traspasos.
 */
export async function tomarCandadosDeInventario(
	transaccion: Transaccion,
	candados: { varianteIds?: Iterable<string>; traspasoIds?: Iterable<string> },
): Promise<void> {
	await candadoDeVariantes(transaccion, candados.varianteIds ?? []);
	await bloquearTraspasos(transaccion, candados.traspasoIds ?? []);
}
