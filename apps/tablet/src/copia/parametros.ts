/**
 * Los parámetros que bajan a la tablet, leídos de su copia: la tanda, los intentos del PIN, la inactividad y los de
 * Producción. Nadie entra antes de la foto completa, así que un parámetro que falta es un error, no un valor escrito aquí.
 * Fase 20 · docs/apps/tablet.md y docs/modulos/admin/configuracion.md («La tabla `parametros`»)
 */

import type { BaseDeLaTablet } from "./base.ts";

/**
 * Un parámetro de la copia, por su clave.
 * @param base La base local.
 * @param clave Su clave.
 * @throws Error si todavía no baja.
 */
async function renglonDe(base: BaseDeLaTablet, clave: string) {
	const renglon = await base.copia("parametros").where("clave").equals(clave).first();
	if (renglon === undefined) throw new Error(`la tablet todavía no tiene ${clave}: falta su foto`);
	return renglon;
}

/**
 * Un parámetro entero.
 * @param base La base local.
 * @param clave Su clave.
 */
export async function parametroEntero(base: BaseDeLaTablet, clave: string): Promise<number> {
	return Number((await renglonDe(base, clave)).valor_entero);
}

/**
 * Un parámetro de sí o no.
 * @param base La base local.
 * @param clave Su clave.
 */
export async function parametroBooleano(base: BaseDeLaTablet, clave: string): Promise<boolean> {
	return (await renglonDe(base, clave)).valor_booleano === true;
}

/**
 * Un parámetro de texto.
 * @param base La base local.
 * @param clave Su clave.
 */
export async function parametroTexto(base: BaseDeLaTablet, clave: string): Promise<string> {
	return String((await renglonDe(base, clave)).valor_texto ?? "");
}
