/**
 * Los tipos base de Unifórmame: el dinero, el día de negocio, el momento y el identificador.
 * Fase 1 · docs/cimientos/PAQUETE-COMPARTIDO.md («Qué va aquí», «Dinero» y «Fechas y horas»)
 *
 * `Centavos` y `Uuid` llevan una marca de tipo: un número cualquiera no pasa por centavos ni un texto
 * cualquiera por identificador. Solo se obtienen al validarlos con `esCentavos`, `centavos` o `esUuid`.
 */

import type { Temporal } from "temporal-polyfill";

declare const marca: unique symbol;

/** Dinero en centavos enteros: un número entero seguro (`Number.isSafeInteger`), nunca con decimales. */
export type Centavos = number & { readonly [marca]: "Centavos" };

/** Un identificador uuid v7, en minúsculas y con guiones. */
export type Uuid = string & { readonly [marca]: "Uuid" };

/** El día de negocio: la fecha en hora de México de cuando pasó algo. Viaja como `AAAA-MM-DD`. */
export type DiaNegocio = Temporal.PlainDate;

/** Un momento exacto (`timestamptz`, las columnas que terminan en `_en`). Viaja en ISO 8601, en UTC. */
export type Momento = Temporal.Instant;

/**
 * Dice si un número es un monto válido en centavos.
 * @param numero El número que se revisa.
 * @returns `true` si es un entero seguro; entonces TypeScript lo trata como `Centavos`.
 */
export function esCentavos(numero: number): numero is Centavos {
	return Number.isSafeInteger(numero);
}

/**
 * Convierte un número entero en centavos, o falla si no lo es.
 * @param numero Un monto ya en centavos, como 125000 para $1,250.
 * @returns El mismo número como `Centavos`.
 * @throws RangeError si tiene decimales o no es un entero seguro: así un monto mal calculado no sigue adelante.
 */
export function centavos(numero: number): Centavos {
	if (!esCentavos(numero)) throw new RangeError(`${numero} no es un monto en centavos enteros`);
	return numero;
}

/** La forma de un uuid v7: versión 7 y variante RFC 9562. */
const formaDeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Dice si un texto es un uuid v7.
 * @param texto El texto que se revisa.
 * @returns `true` si tiene la forma de un uuid v7 en minúsculas; entonces TypeScript lo trata como `Uuid`.
 */
export function esUuid(texto: string): texto is Uuid {
	return formaDeUuid.test(texto);
}
