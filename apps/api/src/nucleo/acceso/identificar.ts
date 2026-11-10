/**
 * Quién llama, con la sesión de Google: el paso 1 del corredor en la web.
 * Fase 5 · docs/cimientos/ACCESO-Y-PERMISOS.md («Cómo se revisa cada llamada», pasos 1 y 2)
 *
 * La cookie `ua_sesion` se revisa como dice `sesion.ts`; si pasa, quien llama es su cuenta con sus
 * departamentos efectivos, sus permisos finos, si es la dueña o soporte y su última confirmación con
 * Google. Sin sesión válida no hay quien llama, y la llamada responde `401 sin_sesion`.
 * Fase 6: con `Authorization: Llave …` quien llama es el aparato de esa llave (`llave.ts`).
 */

import type { FastifyRequest } from "fastify";
import type { Temporal } from "temporal-polyfill";
import { leerPermisosDe } from "../../modulos/admin/lecturas/permisos-de.ts";
import type { Base } from "../base/conexion.ts";
import type { Transaccion } from "../base/transacciones.ts";
import { cookies } from "./cookies.ts";
import { identificarConLlave, traeLlave } from "./llave.ts";
import type { CuentaQueLlama, QuienLlama } from "./quien.ts";
import { revisarSesion, type SesionValida } from "./sesion.ts";

/**
 * La cuenta de una sesión válida, con lo que puede.
 * @param base La base o la transacción.
 * @param sesion La sesión que pasó la revisión.
 * @returns Quien llama, o `undefined` si la cuenta ya no está activa.
 */
export async function cuentaDeLaSesion(
	base: Base | Transaccion,
	sesion: SesionValida,
): Promise<CuentaQueLlama | undefined> {
	const permisos = await leerPermisosDe(base, sesion.usuarioId);
	if (permisos === undefined || !permisos.activa) return undefined;
	return {
		tipo: "cuenta",
		usuarioId: sesion.usuarioId,
		sesionId: sesion.sesionId,
		esDuena: permisos.es_duena,
		esSoporte: permisos.es_soporte,
		departamentos: permisos.departamentos.map((depto) => depto.clave),
		permisosFinos: permisos.permisos_finos,
		confirmadoConGoogleEn: sesion.googleConfirmadoEn,
	};
}

/**
 * Arma el paso «quién llama» de la API con las sesiones de Google.
 * @param base La base.
 * @param reloj La hora de cada llamada.
 */
export function identificarConSesion(
	base: Base,
	reloj: () => Temporal.Instant,
): (peticion: FastifyRequest, opciones?: { sinActividad?: true }) => Promise<QuienLlama | undefined> {
	return async (peticion, opciones) => {
		const sesion = await revisarSesion(base, peticion.cookies[cookies.sesion], reloj(), opciones);
		return sesion === undefined ? undefined : cuentaDeLaSesion(base, sesion);
	};
}

/**
 * El paso «quién llama» de la API: con `Authorization: Llave …`, el aparato; si no, la sesión de Google.
 * @param base La base.
 * @param reloj La hora de cada llamada.
 */
export function identificarEnLaApi(
	base: Base,
	reloj: () => Temporal.Instant,
): (peticion: FastifyRequest, opciones?: { sinActividad?: true }) => Promise<QuienLlama | undefined> {
	const conSesion = identificarConSesion(base, reloj);
	return async (peticion, opciones) => {
		if (!traeLlave(peticion.headers.authorization)) return conSesion(peticion, opciones);
		return (await identificarConLlave(base, peticion, reloj(), opciones ?? {}))?.quien;
	};
}
