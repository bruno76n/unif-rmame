/**
 * Lo que la tablet le pide a la API con su llave: `Authorization: Llave {llave_id}.{secreto}` (el secreto, descifrado
 * solo para la llamada), `X-App-Version` y `X-Pendientes` (lo que le queda en la cola). Sin red o con `503` es «sin
 * internet»; `426` es versión vieja; `401 llave_revocada`, revocada. Y el cambio de su llave.
 * Fase 20 · docs/apps/tablet.md («El registro», pasos 4 a 7) y docs/cimientos/API.md («Quién llama» y «Los errores»)
 *
 * Mientras cambia su llave guarda el secreto nuevo: si no supo si el cambio se aplicó, la siguiente llamada prueba la
 * nueva y luego la vieja (`conLaLlaveQueVale`, la misma del puente).
 */

import { ErrorDeLaApi } from "@uniformame/compartido/cliente/cliente";
import { conLaLlaveQueVale } from "@uniformame/compartido/cliente/llave";
import { respuestaDeError } from "@uniformame/compartido/contratos/protocolo";
import { v7 as uuidv7 } from "uuid";
import { pendientes } from "../cola/cola.ts";
import type { AparatoRegistrado, BaseDeLaTablet } from "../copia/base.ts";
import { cifrar, descifrar, llaveDeCifrado } from "../registro/cifrado.ts";
import { versionDeLaTablet } from "../version.ts";

/** No hay red, o el servidor no está (`503`): la tablet sigue sin internet. */
export class SinInternet extends Error {
	constructor() {
		super("Sin internet");
	}
}

/** La dueña revocó esta tablet. */
export class TabletRevocada extends Error {
	constructor() {
		super("Este aparato fue revocado: ya no entra.");
	}
}

/** La versión de la tablet es vieja (`426`). */
export class HayQueActualizar extends Error {
	constructor() {
		super("Hay una versión nueva. Actualiza para seguir.");
	}
}

/** A dónde llama la tablet: la API en su mismo origen, o la que se le dé. */
export interface Conexion {
	/** La dirección de la API sin la diagonal final; vacía, el mismo origen. */
	urlBase: string;
	fetch?: typeof fetch;
}

/**
 * Un secreto nuevo de 32 bytes al azar, en base64url.
 */
export function secretoNuevo(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

/**
 * El aparato registrado.
 * @param base La base local.
 * @throws Error si la tablet no se ha registrado.
 */
async function aparatoDe(base: BaseDeLaTablet): Promise<AparatoRegistrado> {
	const aparato = await base.aparato.get("aparato");
	if (aparato === undefined) throw new Error("la tablet no está registrada");
	return aparato;
}

/**
 * Hace una llamada con un secreto dado.
 * @param base La base local.
 * @param conexion A dónde llama.
 * @param ruta La ruta, con sus parámetros.
 * @param init El método y el cuerpo.
 * @param llave `{llave_id}.{secreto}`.
 * @returns El cuerpo de la respuesta correcta.
 */
async function pedir(
	base: BaseDeLaTablet,
	conexion: Conexion,
	ruta: string,
	init: RequestInit,
	llave: string,
): Promise<unknown> {
	const llamar = conexion.fetch ?? fetch;
	const respuesta = await llamar(`${conexion.urlBase}${ruta}`, {
		...init,
		headers: {
			authorization: `Llave ${llave}`,
			"x-app-version": versionDeLaTablet,
			"x-pendientes": String(await pendientes(base)),
			...(init.body === undefined ? {} : { "content-type": "application/json" }),
		},
	}).catch(() => {
		throw new SinInternet();
	});
	const cuerpo: unknown = await respuesta.json().catch(() => null);
	if (respuesta.ok && cuerpo !== null) return cuerpo;
	const error = respuestaDeError.safeParse(cuerpo);
	if (!error.success || respuesta.status >= 500) throw new SinInternet();
	if (respuesta.status === 426) throw new HayQueActualizar();
	if (error.data.codigo === "llave_revocada") throw new TabletRevocada();
	throw new ErrorDeLaApi(respuesta.status, error.data);
}

/**
 * Hace una llamada con la llave que vale.
 * @param base La base local.
 * @param conexion A dónde llama.
 * @param ruta La ruta, con sus parámetros.
 * @param init El método y el cuerpo (en JSON).
 */
export async function llamarConLlave(
	base: BaseDeLaTablet,
	conexion: Conexion,
	ruta: string,
	init: RequestInit = {},
): Promise<unknown> {
	const aparato = await aparatoDe(base);
	const llave = await llaveDeCifrado(base);
	const nuevo = aparato.secreto_nuevo === undefined ? undefined : await descifrar(llave, aparato.secreto_nuevo);
	return conLaLlaveQueVale(
		{ secreto: await descifrar(llave, aparato.secreto), secretoNuevo: nuevo },
		(secreto) => pedir(base, conexion, ruta, init, `${aparato.llave_id}.${secreto}`),
		async (secreto) => {
			const { secreto_nuevo: _olvidado, ...sinNuevo } = aparato;
			await base.aparato.put({ ...sinNuevo, secreto: await cifrar(llave, secreto) });
		},
	);
}

/**
 * Los encabezados de su llave, para los avisos en vivo.
 * @param base La base local.
 */
export async function encabezadosDeLaLlave(base: BaseDeLaTablet): Promise<Record<string, string>> {
	const aparato = await aparatoDe(base);
	const llave = await llaveDeCifrado(base);
	const secreto = await descifrar(llave, aparato.secreto_nuevo ?? aparato.secreto);
	return { authorization: `Llave ${aparato.llave_id}.${secreto}`, "x-app-version": versionDeLaTablet };
}

/**
 * Cambia su llave: guarda primero el secreto nuevo y llama a `admin.rotar_llave` con el vigente. Sin red, el nuevo se
 * queda para probarlo; si la API dijo que no, se olvida.
 * @param base La base local.
 * @param conexion A dónde llama.
 */
export async function rotarLlave(base: BaseDeLaTablet, conexion: Conexion): Promise<void> {
	const aparato = await aparatoDe(base);
	const llave = await llaveDeCifrado(base);
	const nuevo = secretoNuevo();
	await base.aparato.put({ ...aparato, secreto_nuevo: await cifrar(llave, nuevo) });
	const vigente = await descifrar(llave, aparato.secreto);
	try {
		await pedir(
			base,
			conexion,
			"/v1/acciones/admin.rotar_llave",
			{ method: "POST", body: JSON.stringify({ clave_idempotencia: uuidv7(), datos: { secreto_nuevo: nuevo } }) },
			`${aparato.llave_id}.${vigente}`,
		);
	} catch (error) {
		if (!(error instanceof SinInternet)) await base.aparato.put(aparato);
		throw error;
	}
	await base.aparato.put({ ...aparato, secreto: await cifrar(llave, nuevo) });
}
