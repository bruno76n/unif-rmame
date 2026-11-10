/**
 * El protocolo de la API: el cuerpo de una acción, las respuestas, los errores y sus mensajes.
 * Fase 3 · docs/cimientos/API.md («Acciones y consultas» y «Los errores»)
 *
 * Lo usan la API, para validar y responder, y el cliente, para leer lo que llega.
 */

import { z } from "zod";
import type { ContratoDeAccion, ContratoDeConsulta } from "./definir.ts";

/**
 * El cuerpo de una acción: la clave de idempotencia, los datos y, si edita, la versión que se leyó.
 * @param contrato El contrato de la acción.
 */
export function cuerpoDeAccion(contrato: ContratoDeAccion) {
	return z
		.object({
			clave_idempotencia: z.uuid().describe("La hace el cliente al apretar el botón y la reusa en cada reintento"),
			datos: contrato.entrada,
			...(contrato.edita ? { version: z.number().int().nonnegative().describe("La versión que se leyó") } : {}),
		})
		.strict();
}

/** La respuesta correcta de una acción. */
export function respuestaDeAccion(contrato: ContratoDeAccion) {
	return z.object({
		ok: z.literal(true),
		resultado: contrato.resultado,
		avisos: z.array(z.string()).describe("Mensajes que no bloquean"),
		secreto_entregado: z
			.literal(true)
			.optional()
			.describe("La respuesta repetida de una acción que entregó un secreto: el secreto ya no viene"),
	});
}

/** La respuesta correcta de una consulta. */
export function respuestaDeConsulta(contrato: ContratoDeConsulta) {
	return z.object({
		ok: z.literal(true),
		resultado: contrato.resultado,
		recortado: z.array(z.string()).describe("Los campos que la cuenta no puede ver y no viajan"),
	});
}

/** Los nombres de los errores de la API. */
export const nombresDeError = [
	"validacion",
	"sin_sesion",
	"reautenticar",
	"sin_permiso",
	"no_existe",
	"conflicto_version",
	"demasiado_grande",
	"regla",
	"actualizar",
	"demasiados_intentos",
	"error_interno",
	"no_disponible",
] as const;

/** El nombre de un error de la API. */
export type NombreDeError = (typeof nombresDeError)[number];

/** Cada `error` de la API con su estado HTTP y el mensaje que lleva cuando no trae uno propio. */
export const tablaDeErrores = {
	validacion: { estado: 400, mensaje: "Revisa los datos marcados." },
	sin_sesion: { estado: 401, mensaje: "Tu sesión se cerró. Vuelve a entrar." },
	reautenticar: { estado: 401, mensaje: "Confirma con Google para seguir." },
	sin_permiso: { estado: 403, mensaje: "Esta cuenta no tiene acceso a esto." },
	no_existe: { estado: 404, mensaje: "No existe." },
	conflicto_version: { estado: 409, mensaje: "Alguien más cambió esto mientras lo veías. Revisa y vuelve a guardar." },
	demasiado_grande: { estado: 413, mensaje: "Lo que se mandó es demasiado grande." },
	regla: { estado: 422, mensaje: "No se pudo." },
	actualizar: { estado: 426, mensaje: "Hay una versión nueva. Actualiza para seguir." },
	demasiados_intentos: { estado: 429, mensaje: "Demasiados intentos. Vuelve a intentar más tarde." },
	error_interno: { estado: 500, mensaje: "Algo falló de nuestro lado. Ya quedó registrado; vuelve a intentar." },
	no_disponible: { estado: 503, mensaje: "El sistema está en mantenimiento. Vuelve a intentar en un rato." },
} as const satisfies Record<NombreDeError, { estado: number; mensaje: string }>;

/** La forma de toda respuesta de error. */
export const respuestaDeError = z.object({
	ok: z.literal(false),
	error: z.enum(nombresDeError),
	codigo: z.string().nullable(),
	mensaje: z.string(),
	campos: z.record(z.string(), z.string()).optional(),
	version: z.number().int().optional(),
	datos: z.unknown().optional(),
	version_minima: z.string().optional(),
	reintentar_en: z.string().optional(),
	referencia: z.string().optional(),
	proposito: z.string().optional(),
	minutos: z.number().optional(),
});

/** Una respuesta de error ya leída. */
export type RespuestaDeError = z.infer<typeof respuestaDeError>;

/** El mensaje de `clave_usada`: la misma clave llegó con otros datos. */
export const mensajeDeClaveUsada = "Esa operación ya se mandó con otros datos. Recarga la pantalla.";
