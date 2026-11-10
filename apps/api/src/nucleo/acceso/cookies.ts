/**
 * Las cookies de la entrada con Google: `ua_sesion`, `ua_aparato` y `ua_google`.
 * Fase 5 · docs/modulos/admin/acceso-con-google.md («Las cookies»)
 *
 * `ua_sesion` y `ua_aparato` llevan 32 bytes al azar; la base guarda solo su SHA-256. `ua_google` lleva el
 * `state`, el `nonce` y el verificador de PKCE cifrados con AES-256-GCM, con una llave que sale de
 * `COOKIE_SECRETO`: nadie la puede leer ni cambiar sin la llave, y vence a los 10 minutos.
 */

import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import type { CookieSerializeOptions } from "@fastify/cookie";
import { z } from "zod";

/** Los nombres de las cookies. */
export const cookies = { sesion: "ua_sesion", aparato: "ua_aparato", google: "ua_google" } as const;

/** Cuánto vive `ua_google`: lo que dura ir y volver de Google. */
export const minutosDeLaEntrada = 10;

/** Cuánto vive `ua_aparato`: lo más que deja un navegador. */
const diasDelAparato = 400;

/** Lo común: solo por HTTPS, sin que la lea JavaScript, y no viaja en un `POST` de otro sitio. */
const comunes = { httpOnly: true, secure: true, sameSite: "lax", path: "/" } as const satisfies CookieSerializeOptions;

/**
 * Cómo va `ua_sesion`: hasta que vence la sesión.
 * @param venceEn Cuándo vence la sesión.
 */
export function opcionesDeLaSesion(venceEn: Date): CookieSerializeOptions {
	return { ...comunes, expires: venceEn };
}

/** Cómo va `ua_aparato`. */
export const opcionesDelAparato: CookieSerializeOptions = { ...comunes, maxAge: diasDelAparato * 24 * 60 * 60 };

/** Cómo va `ua_google`. */
export const opcionesDeLaEntrada: CookieSerializeOptions = { ...comunes, maxAge: minutosDeLaEntrada * 60 };

/** Un identificador al azar de 32 bytes, para `ua_sesion` o `ua_aparato`. */
export function nuevoIdentificador(): string {
	return randomBytes(32).toString("base64url");
}

/**
 * El hash que guarda la base de un identificador: SHA-256 en hex.
 * @param identificador Lo que lleva la cookie.
 */
export function hashDe(identificador: string): string {
	return createHash("sha256").update(identificador).digest("hex");
}

/** Lo que guarda `ua_google` entre la ida y la vuelta. */
export const entradaPendiente = z.object({
	state: z.string(),
	nonce: z.string(),
	verificador: z.string(),
	/** `entrar` o `confirmar`. */
	proposito: z.enum(["entrar", "confirmar"]),
	/** La ruta interna a la que regresa. */
	regresar: z.string(),
	/** Cuándo se emitió, en milisegundos. */
	emitida: z.number(),
});

/** Lo que guarda `ua_google`. */
export type EntradaPendiente = z.infer<typeof entradaPendiente>;

/**
 * La llave de AES-256 de `ua_google`, sacada de `COOKIE_SECRETO` con HKDF.
 * @param secreto `COOKIE_SECRETO`.
 */
export function llaveDeLaEntrada(secreto: string): Buffer {
	return Buffer.from(hkdfSync("sha256", secreto, "", "ua_google", 32));
}

/**
 * Cifra lo que lleva `ua_google`.
 * @param llave La llave de `llaveDeLaEntrada`.
 * @param entrada Lo que se guarda.
 * @returns El valor de la cookie: el vector, la etiqueta y el cifrado, en base64url.
 */
export function cifrarEntrada(llave: Buffer, entrada: EntradaPendiente): string {
	const vector = randomBytes(12);
	const cifrador = createCipheriv("aes-256-gcm", llave, vector);
	const cifrado = Buffer.concat([cifrador.update(JSON.stringify(entrada), "utf8"), cifrador.final()]);
	return Buffer.concat([vector, cifrador.getAuthTag(), cifrado]).toString("base64url");
}

/**
 * Descifra `ua_google`.
 * @param llave La llave de `llaveDeLaEntrada`.
 * @param valor El valor de la cookie.
 * @param ahora La hora, en milisegundos.
 * @returns Lo que guardaba, o `undefined` si no se puede leer, alguien la cambió o ya venció.
 */
export function descifrarEntrada(
	llave: Buffer,
	valor: string | undefined,
	ahora: number,
): EntradaPendiente | undefined {
	if (valor === undefined) return undefined;
	try {
		const bytes = Buffer.from(valor, "base64url");
		const descifrador = createDecipheriv("aes-256-gcm", llave, bytes.subarray(0, 12));
		descifrador.setAuthTag(bytes.subarray(12, 28));
		const claro = Buffer.concat([descifrador.update(bytes.subarray(28)), descifrador.final()]).toString("utf8");
		const entrada = entradaPendiente.parse(JSON.parse(claro));
		return ahora - entrada.emitida > minutosDeLaEntrada * 60_000 ? undefined : entrada;
	} catch {
		return undefined;
	}
}
