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
import type { ContextoDeAccion } from "../modulos.ts";

/**
 * Toma la versión de un registro (o del encabezado de su agregado) antes de cambiarlo: primero revisa que
 * la cuenta lo pueda ver; luego, si la versión sigue siendo la que se leyó, la sube y la acción puede
 * cambiar el registro y sus renglones.
 * @param contexto El contexto de la acción: la transacción y la marca que el corredor exige a las que editan.
 * @param tabla La tabla del registro, con las columnas comunes.
 * @param id El id del registro.
 * @param versionLeida La versión que trajo la acción.
 * @param leerVisible Lo que hay ahora, ya recortado según la cuenta, o `undefined` si la cuenta no lo
 * puede ver (entonces sale `404`, como si no existiera). Es lo que lleva el `409`.
 * @throws `404` si no existe o la cuenta no lo puede ver; `409 conflicto_version` si alguien lo cambió.
 */
export async function tomarVersion(
	contexto: ContextoDeAccion,
	tabla: PgTable,
	id: string,
	versionLeida: number | undefined,
	leerVisible: () => Promise<unknown>,
): Promise<void> {
	const { transaccion } = contexto;
	const visible = await leerVisible();
	if (visible === undefined) throw noExiste();
	// La versión se sube aquí con la secuencia, aunque a la tabla le faltara su disparador.
	const tomada = await transaccion.execute(
		sql`UPDATE ${tabla} SET actualizado_en = now(), version = nextval('public.version_global') WHERE id = ${id} AND version = ${versionLeida ?? -1} RETURNING version`,
	);
	contexto.marcarVersionTomada();
	if (tomada.rows.length > 0) return;
	const actual = await transaccion.execute(sql`SELECT version FROM ${tabla} WHERE id = ${id}`);
	const version = actual.rows[0]?.version;
	if (version === undefined) throw noExiste();
	throw conflictoDeVersion(Number(version), visible);
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
