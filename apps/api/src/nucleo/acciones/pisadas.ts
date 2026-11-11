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

/** Los contextos de las acciones que ya revisaron o tomaron su versión: el corredor lo pregunta con `tomoSuVersion`. */
const contextosConVersion = new WeakSet<ContextoDeAccion>();

/**
 * Dice si la acción de este contexto tomó su versión con `tomarVersion`.
 * @param contexto El contexto de la acción.
 */
export function tomoSuVersion(contexto: ContextoDeAccion): boolean {
	return contextosConVersion.has(contexto);
}

/**
 * Revisa la versión de un registro (o del encabezado de su agregado) sin cambiarla. Primero bloquea el
 * renglón (`FOR UPDATE`): desde ahí nadie lo cambia hasta que la acción termine, así que la versión y lo
 * que se lee de él son del mismo momento. Luego revisa que la cuenta lo pueda ver y que la versión siga
 * siendo la que se leyó. Sirve sola a la acción que, con lo mismo que ya había, responde sin escribir.
 * @param contexto El contexto de la acción.
 * @param tabla La tabla del registro, con las columnas comunes.
 * @param id El id del registro.
 * @param versionLeida La versión que trajo la acción.
 * @param leerVisible Lo que hay ahora, ya recortado según la cuenta, o `undefined` si la cuenta no lo
 * puede ver (entonces sale `404`, como si no existiera). Es lo que lleva el `409`.
 * @throws `404` si no existe o la cuenta no lo puede ver; `409 conflicto_version` si alguien lo cambió.
 */
export async function revisarVersion(
	contexto: ContextoDeAccion,
	tabla: PgTable,
	id: string,
	versionLeida: number | undefined,
	leerVisible: () => Promise<unknown>,
): Promise<void> {
	const bloqueada = await contexto.transaccion.execute(sql`SELECT version FROM ${tabla} WHERE id = ${id} FOR UPDATE`);
	const version = bloqueada.rows[0]?.version;
	const visible = await leerVisible();
	if (version === undefined || visible === undefined) throw noExiste();
	if (Number(version) !== versionLeida) throw conflictoDeVersion(Number(version), visible);
	contextosConVersion.add(contexto);
}

/**
 * Toma la versión de un registro antes de cambiarlo: la revisa como `revisarVersion` y la sube; la
 * acción ya puede cambiar el registro y sus renglones.
 * @param contexto El contexto de la acción.
 * @param tabla La tabla del registro, con las columnas comunes.
 * @param id El id del registro.
 * @param versionLeida La versión que trajo la acción.
 * @param leerVisible Lo que hay ahora, ya recortado según la cuenta (ver `revisarVersion`).
 * @throws `404` si no existe o la cuenta no lo puede ver; `409 conflicto_version` si alguien lo cambió.
 */
export async function tomarVersion(
	contexto: ContextoDeAccion,
	tabla: PgTable,
	id: string,
	versionLeida: number | undefined,
	leerVisible: () => Promise<unknown>,
): Promise<void> {
	await revisarVersion(contexto, tabla, id, versionLeida, leerVisible);
	await subirVersion(contexto.transaccion, tabla, id);
}

/**
 * Sube la versión de un registro con la secuencia, aunque a la tabla le faltara su disparador: lo usa quien cambia
 * una parte de un agregado (sus renglones) sin haber traído su versión.
 * @param transaccion La transacción de la acción.
 * @param tabla La tabla del registro (o del encabezado de su agregado).
 * @param id El id del registro.
 */
export async function subirVersion(transaccion: Transaccion, tabla: PgTable, id: string): Promise<void> {
	await transaccion.execute(
		sql`UPDATE ${tabla} SET actualizado_en = now(), version = nextval('public.version_global') WHERE id = ${id}`,
	);
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
