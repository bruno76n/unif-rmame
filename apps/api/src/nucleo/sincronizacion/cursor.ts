/**
 * Los cursores de la bajada y de la foto: lo que el aparato guarda entre páginas, firmado por el servidor.
 * Fase 6 · docs/cimientos/SINCRONIZACION.md («Bajar», «Foto»)
 *
 * El cursor lleva el aparato, la versión del esquema de sincronización de su tipo, cuándo se emitió, la
 * última vez que el servidor le pidió la foto (como la vio), la ventana (de `desde` al tope) y la posición
 * (la tabla y el último renglón). Va en JSON en base64url con su
 * HMAC-SHA256: el aparato no lo puede cambiar, y uno de otro aparato, de otro esquema o mal formado no sirve.
 */

import { createHash, createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { TablaQueBaja } from "../modulos.ts";

/** Un número de transacción (`xid8`), como texto de dígitos. */
const xid = z.string().regex(/^\d{1,20}$/);

/** El cursor de la bajada: la ventana de `desde` al tope (nulo si no hay una abierta) y la posición en ella. */
const cursorDeBajada = z
	.object({
		tipo: z.literal("bajar"),
		dispositivo_id: z.uuid(),
		esquema: z.number().int(),
		emitido_en: z.iso.datetime({ offset: true }),
		/** La última vez que el servidor le pidió la foto, como la vio al emitirlo: si cambia, el cursor ya no sirve. */
		foto_pedida_en: z.string().nullable(),
		desde: xid,
		tope: xid.nullable(),
		tabla: z.number().int().nonnegative(),
		posicion: z.object({ xid, id: z.uuid() }).nullable(),
	})
	.strict();

/** El cursor de la foto: dónde empezó (su tope) y la posición, tabla por tabla y por id. */
const cursorDeFoto = z
	.object({
		tipo: z.literal("foto"),
		dispositivo_id: z.uuid(),
		esquema: z.number().int(),
		emitido_en: z.iso.datetime({ offset: true }),
		foto_pedida_en: z.string().nullable(),
		inicio: xid,
		tabla: z.number().int().nonnegative(),
		ultimo_id: z.uuid().nullable(),
	})
	.strict();

/** El cursor de la bajada, ya leído. */
export type CursorDeBajada = z.infer<typeof cursorDeBajada>;

/** El cursor de la foto, ya leído. */
export type CursorDeFoto = z.infer<typeof cursorDeFoto>;

/**
 * La llave del HMAC de los cursores, sacada de `COOKIE_SECRETO` con HKDF (otra que la de `ua_google`).
 * @param secreto `COOKIE_SECRETO`.
 */
export function llaveDelCursor(secreto: string): Buffer {
	return Buffer.from(hkdfSync("sha256", secreto, "", "cursor_de_sincronizacion", 32));
}

/**
 * La firma de un texto.
 * @param llave La llave de `llaveDelCursor`.
 * @param texto Lo que se firma.
 */
function firma(llave: Buffer, texto: string): Buffer {
	return createHmac("sha256", llave).update(texto).digest();
}

/**
 * Firma un cursor.
 * @param llave La llave de `llaveDelCursor`.
 * @param cursor El cursor de la bajada o de la foto.
 * @returns El cursor opaco: el JSON en base64url, un punto y su firma.
 */
export function firmarCursor(llave: Buffer, cursor: CursorDeBajada | CursorDeFoto): string {
	const texto = Buffer.from(JSON.stringify(cursor)).toString("base64url");
	return `${texto}.${firma(llave, texto).toString("base64url")}`;
}

/**
 * Revisa la firma de un cursor y lee su JSON.
 * @param llave La llave de `llaveDelCursor`.
 * @param opaco El cursor como lo mandó el aparato.
 * @returns Su contenido, o `undefined` si la firma no vale o no es JSON.
 */
function contenidoFirmado(llave: Buffer, opaco: string): unknown {
	const [texto, firmado, ...sobra] = opaco.split(".");
	if (texto === undefined || firmado === undefined || sobra.length > 0) return undefined;
	const esperada = firma(llave, texto);
	const llegada = Buffer.from(firmado, "base64url");
	if (llegada.length !== esperada.length || !timingSafeEqual(llegada, esperada)) return undefined;
	try {
		return JSON.parse(Buffer.from(texto, "base64url").toString());
	} catch {
		return undefined;
	}
}

/**
 * Lee el cursor de la bajada, si su firma vale y tiene su forma.
 * @param llave La llave de `llaveDelCursor`.
 * @param opaco El cursor como lo mandó el aparato.
 * @returns El cursor, o `undefined` si no sirve.
 */
export function leerCursorDeBajada(llave: Buffer, opaco: string): CursorDeBajada | undefined {
	const leido = cursorDeBajada.safeParse(contenidoFirmado(llave, opaco));
	return leido.success ? leido.data : undefined;
}

/**
 * Lee el cursor de la foto, si su firma vale y tiene su forma.
 * @param llave La llave de `llaveDelCursor`.
 * @param opaco El cursor como lo mandó el aparato.
 * @returns El cursor, o `undefined` si no sirve.
 */
export function leerCursorDeFoto(llave: Buffer, opaco: string): CursorDeFoto | undefined {
	const leido = cursorDeFoto.safeParse(contenidoFirmado(llave, opaco));
	return leido.success ? leido.data : undefined;
}

/**
 * La versión del esquema de sincronización de un tipo de aparato: sale de sus tablas, su orden y sus
 * columnas, así que cambia sola cuando un módulo cambia lo que baja, y el cursor viejo pide la foto.
 * @param tablas Las tablas que bajan a ese tipo.
 * @returns Un entero de 28 bits (cabe en `dispositivos_sync.esquema_sync`).
 */
export function esquemaDe(tablas: readonly TablaQueBaja[]): number {
	const forma = JSON.stringify(tablas.map((tabla) => [tabla.tabla, tabla.orden, [...tabla.columnas].sort()]));
	return Number.parseInt(createHash("sha256").update(forma).digest("hex").slice(0, 7), 16);
}
