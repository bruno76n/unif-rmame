/**
 * Quién llama, con la sesión de Google: el paso 1 del corredor en la web.
 * Fase 5 · docs/cimientos/ACCESO-Y-PERMISOS.md («Cómo se revisa cada llamada», pasos 1 y 2)
 *
 * La cookie `ua_sesion` se revisa como dice `sesion.ts`; si pasa, quien llama es su cuenta con sus
 * departamentos efectivos, sus permisos finos, si es la dueña o soporte y su última confirmación con
 * Google. Sin sesión válida no hay quien llama, y la llamada responde `401 sin_sesion`. La llave de los
 * aparatos llega en la fase 6.
 */

import type { FastifyRequest } from "fastify";
import type { Temporal } from "temporal-polyfill";
import { leerPermisosDe } from "../../modulos/admin/lecturas/permisos-de.ts";
import type { Base } from "../base/conexion.ts";
import { cookies } from "./cookies.ts";
import type { CuentaQueLlama, QuienLlama } from "./quien.ts";
import { revisarSesion, type SesionValida } from "./sesion.ts";

/**
 * La cuenta de una sesión válida, con lo que puede.
 * @param base La base.
 * @param sesion La sesión que pasó la revisión.
 * @returns Quien llama, o `undefined` si la cuenta ya no está activa.
 */
export async function cuentaDeLaSesion(base: Base, sesion: SesionValida): Promise<CuentaQueLlama | undefined> {
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
): (peticion: FastifyRequest) => Promise<QuienLlama | undefined> {
	return async (peticion) => {
		const sesion = await revisarSesion(base, peticion.cookies[cookies.sesion], reloj());
		return sesion === undefined ? undefined : cuentaDeLaSesion(base, sesion);
	};
}
