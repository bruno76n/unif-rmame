/**
 * Ayudas para llamar la API de prueba desde las pruebas.
 * Fase 3 · docs/fases/03-api-protocolo-e-idempotencia.md
 */

import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { encabezadosDeLaWeb, type ServidorDePrueba } from "./servidor-de-prueba.ts";

/** Una clave de idempotencia nueva, como la hace el cliente al apretar el botón. */
export function nuevaClave(): string {
	return uuidv7();
}

/**
 * Manda una acción a la API de prueba con los encabezados de la web.
 * @param encabezados Encabezados de más, como `x-prueba-google`.
 * @returns El estado y el cuerpo ya leído.
 */
export async function mandarAccion(
	servidor: ServidorDePrueba,
	nombre: string,
	cuerpo: { clave?: string; datos: unknown; version?: number },
	quien = "ventas",
	encabezados: Record<string, string> = {},
): Promise<{ estado: number; cuerpo: Record<string, unknown> }> {
	const respuesta = await servidor.app.inject({
		method: "POST",
		url: `/v1/acciones/${nombre}`,
		headers: { ...encabezadosDeLaWeb(quien), ...encabezados },
		payload: {
			clave_idempotencia: cuerpo.clave ?? nuevaClave(),
			datos: cuerpo.datos,
			...(cuerpo.version === undefined ? {} : { version: cuerpo.version }),
		},
	});
	return { estado: respuesta.statusCode, cuerpo: respuesta.json() };
}

/** Cuenta los renglones de una tabla de la base de prueba (con el dueño, para ver todo). */
export async function contar(servidor: ServidorDePrueba, tabla: string): Promise<number> {
	const { rows } = await servidor.base.dueno.query(`SELECT count(*)::int AS n FROM ${tabla}`);
	return Number(rows[0]?.n);
}

/**
 * El encabezado de «Confirmar con Google» de la sesión de prueba.
 * @param haceMinutos Hace cuántos minutos confirmó; por omisión, ahora.
 */
export function conGoogle(haceMinutos = 0): Record<string, string> {
	return { "x-prueba-google": Temporal.Now.instant().subtract({ minutes: haceMinutos }).toString() };
}

/**
 * Da de alta una cuenta como la dueña, con «Confirmar con Google».
 * @param servidor El servidor de prueba.
 * @param correo El correo de Google.
 * @param departamentos Las claves de sus departamentos.
 * @returns El id de la cuenta nueva.
 */
export async function darDeAltaCuenta(
	servidor: ServidorDePrueba,
	correo: string,
	departamentos: readonly string[],
): Promise<string> {
	const alta = await mandarAccion(
		servidor,
		"admin.crear_cuenta",
		{ datos: { persona_id: uuidv7(), correo, departamentos } },
		"duena",
		conGoogle(),
	);
	const { resultado } = alta.cuerpo;
	if (alta.estado !== 200 || typeof resultado !== "object" || resultado === null || !("usuario_id" in resultado)) {
		throw new Error(`no se dio de alta ${correo}: ${JSON.stringify(alta.cuerpo)}`);
	}
	return String(resultado.usuario_id);
}
