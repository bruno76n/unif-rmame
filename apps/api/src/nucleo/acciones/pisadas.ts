/**
 * Que nadie pise a nadie: la versión que se leyó, el `409` y el control por agregado.
 * Fase 3 · docs/cimientos/IDEMPOTENCIA-Y-CONCURRENCIA.md («Que nadie pise a nadie»)
 *
 * Una acción que edita algo que ya existe toma su versión con `tomarVersion` antes de cambiarlo: el
 * cambio solo pasa si la versión sigue siendo la que se leyó, y si no, sale `409` con la versión actual
 * y sus datos recortados. En un agregado (un pedido con sus renglones) se toma la del encabezado, así
 * que un cambio en un renglón también sube la versión del pedido.
 */

import { sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { Transaccion } from "../base/transacciones.ts";
import { conflictoDeVersion, noExiste } from "../http/errores.ts";

/**
 * Toma la versión de un registro (o del encabezado de su agregado): si sigue siendo la que se leyó, la
 * sube (el disparador pone la nueva) y la acción puede cambiar el registro y sus renglones.
 * @param transaccion La transacción de la acción.
 * @param tabla La tabla del registro, con las columnas comunes.
 * @param id El id del registro.
 * @param versionLeida La versión que trajo la acción.
 * @param datosActuales Cómo leer lo que hay ahora, ya recortado según la cuenta, para el `409`.
 * @throws `409 conflicto_version` si alguien lo cambió; `404` si no existe.
 */
export async function tomarVersion(
	transaccion: Transaccion,
	tabla: PgTable,
	id: string,
	versionLeida: number | undefined,
	datosActuales: () => Promise<unknown>,
): Promise<void> {
	const tomada = await transaccion.execute(
		sql`UPDATE ${tabla} SET actualizado_en = now() WHERE id = ${id} AND version = ${versionLeida ?? -1} RETURNING version`,
	);
	if (tomada.rows.length > 0) return;
	const actual = await transaccion.execute(sql`SELECT version FROM ${tabla} WHERE id = ${id}`);
	const version = actual.rows[0]?.version;
	if (version === undefined) throw noExiste();
	throw conflictoDeVersion(Number(version), await datosActuales());
}

/**
 * La versión actual de un registro, para regresarla en `resultado.version` al final de la acción.
 * @param transaccion La transacción de la acción.
 * @param tabla La tabla del registro (o del encabezado de su agregado).
 * @param id El id del registro.
 */
export async function versionActual(transaccion: Transaccion, tabla: PgTable, id: string): Promise<number> {
	const actual = await transaccion.execute(sql`SELECT version FROM ${tabla} WHERE id = ${id}`);
	const version = actual.rows[0]?.version;
	if (version === undefined) throw noExiste();
	return Number(version);
}
