/**
 * La siembra del sistema: lo que tiene que existir en toda base, también en producción.
 * Fase 2 · docs/cimientos/BASE-DE-DATOS.md («Siembra del sistema y datos de la muestra»)
 *
 * Cada módulo declara la suya (departamentos, ubicaciones, parámetros con su valor inicial, listas,
 * contadores de folio). Corre después de cada migración: agrega lo que falta y nunca cambia lo que ya
 * existe, para no pisar un valor que la dueña ya cambió.
 */

import type { PgTable } from "drizzle-orm/pg-core";
import type { Base } from "./conexion.ts";

/**
 * Lo que un módulo siembra: los renglones de una de sus tablas con su llave única, o una siembra propia
 * (como la de los parámetros, que también escribe su historial) que regresa cuántos agregó.
 */
export type Semilla =
	| { tabla: PgTable; filas: Record<string, unknown>[] }
	| { sembrar: (base: Base) => Promise<number> };

/**
 * Siembra los renglones que falten. Si un renglón ya existe (choca con su llave primaria o única),
 * se deja como está.
 * @param base La base, con el rol dueño.
 * @param semillas Las de todos los módulos.
 * @returns Cuántos renglones nuevos se agregaron.
 */
export async function sembrarSistema(base: Base, semillas: readonly Semilla[]): Promise<number> {
	let agregados = 0;
	for (const semilla of semillas) {
		if ("sembrar" in semilla) {
			agregados += await semilla.sembrar(base);
			continue;
		}
		if (semilla.filas.length === 0) continue;
		const resultado = await base.insert(semilla.tabla).values(semilla.filas).onConflictDoNothing();
		agregados += resultado.rowCount ?? 0;
	}
	return agregados;
}
