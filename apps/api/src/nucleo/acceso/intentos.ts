/**
 * Los intentos que llevan al `429`: las entradas fallidas desde una IP (y, en la fase 6, los códigos de
 * registro equivocados).
 * Fase 5 · docs/modulos/admin/acceso-con-google.md (regla 8 y «La tabla `intentos_recientes`»)
 *
 * Viven en `intentos_recientes`, así que valen para todas las instancias de la API. Cada falla suma en su
 * ventana; al llegar al máximo la clave queda bloqueada hasta que la ventana pasa. Una ventana vencida
 * vuelve a empezar en uno, y el renglón que ya no bloquea se borra al revisarlo.
 */

import { sql } from "drizzle-orm";
import type { Temporal } from "temporal-polyfill";
import type { Base } from "../base/conexion.ts";

/** Cuántos intentos y en qué ventana, de sus parámetros. */
export interface LimiteDeIntentos {
	maximo: number;
	minutos: number;
}

/**
 * Dice hasta cuándo está bloqueada una clave.
 * @param base La base.
 * @param clave `entrada:{ip}` o `codigo:{ip}`.
 * @param ahora La hora.
 * @param limite El máximo y la ventana.
 * @returns El momento en que se puede volver a intentar, o `undefined` si no está bloqueada.
 */
export async function bloqueadaHasta(
	base: Base,
	clave: string,
	ahora: Temporal.Instant,
	limite: LimiteDeIntentos,
): Promise<string | undefined> {
	const momento = ahora.toString();
	// Lo que ya no bloquea ni cuenta se quita aquí: la tabla no crece.
	await base.execute(
		sql`DELETE FROM intentos_recientes WHERE clave = ${clave}
			AND (bloqueado_hasta IS NULL OR bloqueado_hasta <= ${momento}::timestamptz)
			AND ventana_inicio + ${`${limite.minutos} minutes`}::interval <= ${momento}::timestamptz`,
	);
	const { rows } = await base.execute(
		sql`SELECT bloqueado_hasta FROM intentos_recientes WHERE clave = ${clave} AND bloqueado_hasta > ${momento}::timestamptz`,
	);
	const hasta = rows[0]?.bloqueado_hasta;
	return hasta === undefined || hasta === null ? undefined : new Date(String(hasta)).toISOString();
}

/**
 * Anota una falla. Una sola sentencia: dos instancias a la vez cuentan las dos.
 * @param base La base.
 * @param clave `entrada:{ip}` o `codigo:{ip}`.
 * @param ahora La hora.
 * @param limite El máximo y la ventana.
 */
export async function anotarFalla(
	base: Base,
	clave: string,
	ahora: Temporal.Instant,
	limite: LimiteDeIntentos,
): Promise<void> {
	const momento = ahora.toString();
	const ventana = `${limite.minutos} minutes`;
	await base.execute(sql`
		INSERT INTO intentos_recientes AS i (clave, ventana_inicio, intentos, bloqueado_hasta)
		VALUES (${clave}, ${momento}::timestamptz, 1,
			CASE WHEN 1 >= ${limite.maximo}::integer THEN ${momento}::timestamptz + ${ventana}::interval END)
		ON CONFLICT (clave) DO UPDATE SET
			ventana_inicio = CASE WHEN i.ventana_inicio + ${ventana}::interval <= ${momento}::timestamptz
				THEN ${momento}::timestamptz ELSE i.ventana_inicio END,
			intentos = CASE WHEN i.ventana_inicio + ${ventana}::interval <= ${momento}::timestamptz
				THEN 1 ELSE i.intentos + 1 END,
			bloqueado_hasta = CASE
				WHEN i.ventana_inicio + ${ventana}::interval <= ${momento}::timestamptz
					THEN CASE WHEN 1 >= ${limite.maximo}::integer THEN ${momento}::timestamptz + ${ventana}::interval END
				WHEN i.intentos + 1 >= ${limite.maximo}::integer THEN i.ventana_inicio + ${ventana}::interval
				ELSE i.bloqueado_hasta END`);
}
