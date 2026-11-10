/**
 * La forma de la sincronización de los aparatos: lo que sube la tablet (después la caja) y lo que le contesta
 * el servidor, comando por comando.
 * Fase 6 · docs/cimientos/SINCRONIZACION.md («Subir · `POST /v1/sync/subir`»)
 *
 * No son acciones de `/v1/acciones`: la subida lleva muchas acciones en una tanda, cada una con su clave.
 * Su forma va aquí para que la tablet, la caja y la API usen la misma.
 */

import { z } from "zod";

/** Lo que puede pasar con cada comando de la tanda. */
export const resultadosDeComando = ["aplicado", "repetido", "apartado", "excepcion"] as const;

/** Un comando de la cola del aparato. Sus `datos` se revisan después contra el contrato de su acción. */
export const comandoQueSube = z
	.object({
		clave_idempotencia: z.uuid().describe("La hizo el aparato al guardar el comando"),
		accion: z
			.string()
			.regex(/^[a-z_]+\.[a-z_]+$/, "Escribe la acción como modulo.accion.")
			.describe("`modulo.accion`, de su alcance"),
		datos: z.unknown().describe("Con la forma del contrato de esa acción"),
		ocurrido_en: z.iso.datetime({ offset: true }).describe("Cuándo pasó, con la hora del aparato"),
		persona_id: z.uuid().optional().describe("Quien registra (o quien cobra, en la caja)"),
		codigo_usado: z.string().trim().min(1).max(40).optional().describe("Solo en la caja"),
	})
	.strict();

/** El cuerpo de `POST /v1/sync/subir`. */
export const cuerpoDeSubida = z
	.object({
		enviado_en: z.iso.datetime({ offset: true }).describe("La hora del aparato al mandar la tanda"),
		pendientes_por_subir: z.number().int().nonnegative().describe("Lo que le queda en la cola, contando esta tanda"),
		comandos: z.array(comandoQueSube).min(1).describe("De 1 a `sync.tanda_max_comandos`, en el orden en que pasaron"),
	})
	.strict();

/** La respuesta a un comando de la tanda. */
export const respuestaDeComando = z
	.object({
		clave_idempotencia: z.uuid().describe("La clave del comando"),
		resultado: z.enum(resultadosDeComando).describe("Qué pasó con el comando"),
		datos: z
			.record(z.string(), z.unknown())
			.nullable()
			.describe("Lo que regresó su acción (su mensaje y su folio, si lo dio el servidor); nulo si se apartó"),
		entidad: z.object({ tabla: z.string(), id: z.uuid() }).nullable().describe("El documento que creó o tocó"),
		excepciones: z
			.array(z.object({ id: z.uuid(), codigo: z.string() }))
			.describe("Las excepciones que abrió: se aplicó, pero no cuadra"),
		motivo: z.string().nullable().describe("Por qué se apartó"),
		espera_entidad_id: z.uuid().nullable().describe("Con `falta_documento`: el documento que espera"),
		campos: z.record(z.string(), z.string()).nullable().describe("Con `mal_formado`: cada campo y su mensaje"),
		avisos: z.array(z.string()).describe("Los avisos de la acción"),
	})
	.strict();

/** La respuesta de `POST /v1/sync/subir`: `200` siempre que la llave valga, aunque haya apartados. */
export const respuestaDeSubida = z
	.object({
		ok: z.literal(true),
		respuestas: z.array(respuestaDeComando).describe("Una por comando con respuesta, en el mismo orden"),
		detenido: z
			.boolean()
			.describe("La tanda se cortó por un error del servidor: se vuelve a mandar desde el primero sin respuesta"),
		revocado: z.boolean().describe("La llave está revocada"),
		hay_cambios: z.boolean().describe("Hay algo nuevo que bajar"),
	})
	.strict();
