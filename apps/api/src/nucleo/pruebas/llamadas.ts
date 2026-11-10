/**
 * Ayudas para llamar la API de prueba desde las pruebas.
 * Fase 3 · docs/fases/03-api-protocolo-e-idempotencia.md
 */

import { v7 as uuidv7 } from "uuid";
import { encabezadosDeLaWeb, type ServidorDePrueba } from "./servidor-de-prueba.ts";

/** Una clave de idempotencia nueva, como la hace el cliente al apretar el botón. */
export function nuevaClave(): string {
	return uuidv7();
}

/**
 * Manda una acción a la API de prueba con los encabezados de la web.
 * @returns El estado y el cuerpo ya leído.
 */
export async function mandarAccion(
	servidor: ServidorDePrueba,
	nombre: string,
	cuerpo: { clave?: string; datos: unknown; version?: number },
	quien = "ventas",
): Promise<{ estado: number; cuerpo: Record<string, unknown> }> {
	const respuesta = await servidor.app.inject({
		method: "POST",
		url: `/v1/acciones/${nombre}`,
		headers: encabezadosDeLaWeb(quien),
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
