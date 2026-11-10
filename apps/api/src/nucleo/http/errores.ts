/**
 * Los errores de la API: cómo los lanza el código y cómo salen en la respuesta.
 * Fase 3 · docs/cimientos/API.md («Los errores»)
 *
 * Todo error sale con `{ ok: false, error, codigo, mensaje, … }`. Un error de validación sale con cada
 * campo y su mensaje; uno que nadie esperaba sale como `500`, sin su causa, con una `referencia` que
 * queda en el registro técnico.
 */

import { randomUUID } from "node:crypto";
import { type NombreDeError, type RespuestaDeError, tablaDeErrores } from "@uniformame/compartido/contratos/protocolo";
import type { FastifyBaseLogger } from "fastify";
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod";

/** Lo de más que puede llevar una respuesta de error, según su tabla. */
type ExtraDeError = Omit<RespuestaDeError, "ok" | "error" | "codigo" | "mensaje">;

/** Un error que la API responde tal cual, con su forma. */
export class ErrorDeApi extends Error {
	readonly error: NombreDeError;
	readonly codigo: string | null;
	readonly extra: ExtraDeError;

	/**
	 * @param error El nombre del error de la tabla de la API.
	 * @param codigo Su código, o `null` si no lleva.
	 * @param mensaje El mensaje en español; si no se da, el de la tabla.
	 * @param extra Lo de más que trae (`version`, `datos`, `version_minima`…).
	 */
	constructor(error: NombreDeError, codigo: string | null = null, mensaje?: string, extra: ExtraDeError = {}) {
		super(mensaje ?? tablaDeErrores[error].mensaje);
		this.error = error;
		this.codigo = codigo;
		this.extra = extra;
	}

	/** El estado HTTP que le toca. */
	get estado(): number {
		return tablaDeErrores[this.error].estado;
	}

	/** El cuerpo de la respuesta. */
	cuerpo(): RespuestaDeError {
		return { ok: false, error: this.error, codigo: this.codigo, mensaje: this.message, ...this.extra };
	}
}

/**
 * Un error de regla del negocio: sale como `422` con su código y su mensaje.
 * @param codigo El código estable que dice el archivo de la acción (`rollo_sin_usar`).
 * @param mensaje El mensaje que dice el archivo de la acción.
 */
export function errorDeRegla(codigo: string, mensaje: string): ErrorDeApi {
	return new ErrorDeApi("regla", codigo, mensaje);
}

/** Lo que no existe, o existe pero la cuenta no lo puede ver: `404`. */
export function noExiste(): ErrorDeApi {
	return new ErrorDeApi("no_existe");
}

/**
 * Alguien cambió el registro desde que se leyó: `409` con la versión actual y sus datos ya recortados.
 * @param version La versión actual.
 * @param datos Lo que hay ahora, recortado según la cuenta.
 */
export function conflictoDeVersion(version: number, datos: unknown): ErrorDeApi {
	return new ErrorDeApi("conflicto_version", null, undefined, { version, datos });
}

/**
 * Convierte la ruta de un error de Zod (`/datos/motivo`) en el nombre del campo (`motivo`).
 * @param ruta La ruta JSON del error.
 */
function campoDe(ruta: string): string {
	const partes = ruta.split("/").filter((parte) => parte !== "");
	const sinSobre = partes[0] === "datos" ? partes.slice(1) : partes;
	return sinSobre.length === 0 ? partes.join(".") || "datos" : sinSobre.join(".");
}

/** Lee una propiedad de un error cualquiera, sin suponer su forma. */
function propiedad(error: unknown, nombre: "code" | "statusCode"): unknown {
	return typeof error === "object" && error !== null && nombre in error ? Reflect.get(error, nombre) : undefined;
}

/**
 * Arma la respuesta de cualquier error que llegue al manejador de Fastify.
 * @param error Lo que se lanzó.
 * @param registro El registro técnico (pino), donde queda la causa de un `500`.
 * @returns El estado y el cuerpo.
 */
export function responderError(
	error: unknown,
	registro: FastifyBaseLogger,
): { estado: number; cuerpo: RespuestaDeError } {
	if (error instanceof ErrorDeApi) return { estado: error.estado, cuerpo: error.cuerpo() };
	if (hasZodFastifySchemaValidationErrors(error)) {
		const campos: Record<string, string> = {};
		for (const problema of error.validation) {
			// Un objeto con campos de más dice cuáles; los demás, en qué campo están.
			const llaves = problema.params.keys;
			const nombres = Array.isArray(llaves)
				? llaves.map((llave) => campoDe(`${problema.instancePath}/${llave}`))
				: [campoDe(problema.instancePath)];
			for (const nombre of nombres) campos[nombre] ??= problema.message ?? "";
		}
		return { estado: 400, cuerpo: { ...new ErrorDeApi("validacion").cuerpo(), campos } };
	}
	const codigo = propiedad(error, "code");
	if (codigo === "FST_ERR_CTP_BODY_TOO_LARGE")
		return { estado: 413, cuerpo: new ErrorDeApi("demasiado_grande").cuerpo() };
	// Un cuerpo que no es JSON o viene vacío es un error de forma, como cualquier otro.
	if (propiedad(error, "statusCode") === 400) {
		return { estado: 400, cuerpo: { ...new ErrorDeApi("validacion").cuerpo(), campos: {} } };
	}
	const referencia = randomUUID();
	registro.error({ err: error, referencia }, "error interno");
	return { estado: 500, cuerpo: new ErrorDeApi("error_interno", null, undefined, { referencia }).cuerpo() };
}
