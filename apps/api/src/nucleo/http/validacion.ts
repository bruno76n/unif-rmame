/**
 * La validación de la forma (paso 3): revisa el cuerpo y los parámetros contra su contrato y deja pasar
 * los datos tal como llegaron.
 * Fase 3 · docs/cimientos/API.md («Los errores») y docs/cimientos/MODULOS.md («Cómo corre una acción»)
 *
 * Los datos se transforman una sola vez, en la acción o la consulta (`implementarAccion`), y la huella de
 * idempotencia se calcula sobre el JSON que llegó, que siempre es texto, números y listas: así una fecha
 * nunca se vuelve `{}` en la huella.
 */

import type { FastifySchemaCompiler } from "fastify";
import { z } from "zod";
import { ErrorDeApi } from "./errores.ts";

/**
 * Convierte la ruta de un problema de Zod en el nombre del campo, sin el `datos` de adelante.
 * @param ruta La ruta del problema.
 */
function campoDe(ruta: readonly PropertyKey[]): string {
	const partes = ruta.map(String);
	const sinSobre = partes[0] === "datos" ? partes.slice(1) : partes;
	return sinSobre.length === 0 ? partes.join(".") || "datos" : sinSobre.join(".");
}

/**
 * Los campos con su mensaje, como los pone la pantalla debajo de cada campo.
 * @param error El error de Zod.
 */
export function camposDeZod(error: z.ZodError): Record<string, string> {
	const campos: Record<string, string> = {};
	for (const problema of error.issues) {
		// Un objeto con campos de más dice cuáles; los demás, en qué campo están.
		const nombres =
			problema.code === "unrecognized_keys"
				? problema.keys.map((llave) => campoDe([...problema.path, llave]))
				: [campoDe(problema.path)];
		for (const nombre of nombres) campos[nombre] ??= problema.message;
	}
	return campos;
}

/**
 * El compilador de validación de Fastify: con el esquema del contrato revisa lo que llegó y, si cumple,
 * lo deja pasar sin transformar.
 */
export const validarSinTransformar: FastifySchemaCompiler<z.ZodType> =
	({ schema }) =>
	(datos) => {
		const resultado = z.safeParse(schema, datos);
		if (resultado.success) return { value: datos };
		return { error: new ErrorDeApi("validacion", null, undefined, { campos: camposDeZod(resultado.error) }) };
	};
