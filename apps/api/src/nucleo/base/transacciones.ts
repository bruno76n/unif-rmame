/**
 * Las transacciones con reintento.
 * Fase 2 · docs/cimientos/BASE-DE-DATOS.md («Candados»)
 *
 * Si Postgres corta una transacción por un bloqueo cruzado (`40P01`) o por serialización (`40001`),
 * se repite la transacción completa hasta tres veces, con una espera corta al azar entre intentos; a la
 * cuarta se responde el error.
 */

import { setTimeout as esperar } from "node:timers/promises";
import { PgTransaction } from "drizzle-orm/pg-core";
import type { Base } from "./conexion.ts";

/** La transacción que recibe el trabajo: la misma interfaz que la base, dentro de una transacción. */
export type Transaccion = Parameters<Parameters<Base["transaction"]>[0]>[0];

/** Las veces que se repite una transacción que chocó. */
export const reintentosPorChoque = 3;

/** Los códigos de Postgres que dicen que la transacción chocó con otra y se puede repetir. */
const codigosDeChoque = new Set(["40P01", "40001"]);

/**
 * Busca el código de Postgres de un error, también dentro del error con que lo envuelve Drizzle.
 * @param error Lo que se lanzó.
 * @returns El código (`40P01`, `23505`…), o `undefined` si no es un error de Postgres.
 */
export function codigoDePostgres(error: unknown): string | undefined {
	for (let actual: unknown = error; typeof actual === "object" && actual !== null; ) {
		if ("code" in actual && typeof actual.code === "string") return actual.code;
		actual = "cause" in actual ? actual.cause : undefined;
	}
	return undefined;
}

/**
 * Corre un trabajo en una transacción y la repite completa si chocó con otra.
 * @param base La base con Drizzle, o una transacción: entonces esta queda en un `SAVEPOINT` de aquella y,
 * si choca, no se repite aquí, porque la que se repite completa es la de afuera.
 * @param trabajo Lo que se hace dentro de la transacción; se puede correr más de una vez, así que no
 * debe tocar nada fuera de la base.
 * @returns Lo que regresa el trabajo.
 * @throws El error del trabajo si no es un choque, o el del cuarto intento si sigue chocando.
 */
export async function enTransaccion<T>(
	base: Base | Transaccion,
	trabajo: (transaccion: Transaccion) => Promise<T>,
): Promise<T> {
	// Dentro de otra transacción no se reintenta: el choque lo repite completa la transacción de afuera.
	if (base instanceof PgTransaction) return base.transaction(trabajo);
	for (let intento = 0; ; intento++) {
		try {
			return await base.transaction(trabajo);
		} catch (error) {
			const codigo = codigoDePostgres(error);
			if (intento >= reintentosPorChoque || codigo === undefined || !codigosDeChoque.has(codigo)) throw error;
			// Una espera corta y al azar, para que las dos transacciones que chocaron no vuelvan a chocar igual.
			await esperar(Math.random() * 20 * (intento + 1));
		}
	}
}
