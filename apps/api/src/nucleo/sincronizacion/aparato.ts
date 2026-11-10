/**
 * Quién llama a la sincronización: un aparato con su llave y con la versión mínima de su app.
 * Fase 6 · docs/cimientos/SINCRONIZACION.md («Subir», «Bajar» y «Foto»: el paso 1)
 *
 * La subida, la bajada y la foto no aceptan una sesión de la web: solo la llave del aparato.
 */

import { type App, compararVersiones, versionMinima } from "@uniformame/compartido/contratos/versiones";
import type { FastifyRequest } from "fastify";
import type { Temporal } from "temporal-polyfill";
import { type AparatoConLlave, identificarConLlave } from "../acceso/llave.ts";
import { appDe } from "../acceso/quien.ts";
import type { Base } from "../base/conexion.ts";
import { ErrorDeApi } from "../http/errores.ts";

/**
 * Identifica al aparato por su llave y revisa la versión de su app.
 * @param base La base.
 * @param versionMinimaDelParametro La versión mínima del parámetro de la dueña para una app.
 * @param peticion La petición.
 * @param ahora La hora de la llamada.
 * @returns El aparato, con su nombre y si está revocado.
 * @throws `401 sin_sesion` sin llave o con una que no vale, `426 actualizar` con una app vieja.
 */
export async function identificarAparato(
	base: Base,
	versionMinimaDelParametro: (app: App) => Promise<string>,
	peticion: FastifyRequest,
	ahora: Temporal.Instant,
): Promise<AparatoConLlave> {
	const aparato = await identificarConLlave(base, peticion, ahora);
	if (aparato === undefined) throw new ErrorDeApi("sin_sesion", "sin_sesion");
	const app = appDe(aparato.quien);
	const minima = versionMinima(app, await versionMinimaDelParametro(app));
	const version = peticion.headers["x-app-version"];
	if (typeof version !== "string" || (compararVersiones(version, minima) ?? -1) < 0) {
		throw new ErrorDeApi("actualizar", null, undefined, { version_minima: minima });
	}
	peticion.quien = aparato.quien;
	return aparato;
}
