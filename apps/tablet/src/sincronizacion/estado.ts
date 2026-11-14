/**
 * Lo que la tablet guarda de su sincronización: el estado del aparato (preparando su foto, lista, revocada o por
 * actualizar), su cursor, su intervalo y cuándo bajó completa por última vez.
 * Fase 20 · docs/apps/tablet.md y docs/interfaz/tablet.md («Las pantallas del aparato»)
 */

import type { BaseDeLaTablet } from "../copia/base.ts";

/** Cómo está el aparato: sin registro, preparando su foto, lista, revocada o con una versión vieja. */
export type EstadoDelAparato = "sin_registro" | "preparando" | "lista" | "revocada" | "actualizar";

/** Las claves de lo que guarda. */
type ClaveDeSincronizacion = "estado" | "cursor" | "intervalo_segundos" | "ultima_bajada";

/**
 * Lee un dato de la sincronización.
 * @param base La base local.
 * @param clave Su clave.
 */
export async function leerDato(base: BaseDeLaTablet, clave: ClaveDeSincronizacion): Promise<unknown> {
	return (await base.sincronizacion.get(clave))?.valor;
}

/**
 * Guarda un dato de la sincronización.
 * @param base La base local.
 * @param clave Su clave.
 * @param valor Su valor.
 */
export async function guardarDato(base: BaseDeLaTablet, clave: ClaveDeSincronizacion, valor: unknown): Promise<void> {
	await base.sincronizacion.put({ clave, valor });
}

/**
 * El estado del aparato: sin registro si no tiene llave.
 * @param base La base local.
 */
export async function estadoDelAparato(base: BaseDeLaTablet): Promise<EstadoDelAparato> {
	if ((await base.aparato.get("aparato")) === undefined) return "sin_registro";
	const estado = await leerDato(base, "estado");
	return estado === "lista" || estado === "revocada" || estado === "actualizar" ? estado : "preparando";
}
