/**
 * Prueba del cifrado de `ua_google`.
 * Fase 5 · docs/fases/05-acceso-con-google-cuentas-y-permisos.md (parte 2)
 */

import { describe, expect, it } from "vitest";
import { cifrarEntrada, descifrarEntrada, llaveDeLaEntrada } from "./cookies.ts";

describe("ua_google se lee solo con su llave, sin cambios y en sus 10 minutos", () => {
	const llave = llaveDeLaEntrada("una-llave-de-prueba-de-al-menos-32-letras");
	const emitida = Date.UTC(2026, 10, 10, 12, 0, 0);
	const entrada = {
		state: "s",
		nonce: "n",
		verificador: "v",
		proposito: "entrar" as const,
		regresar: "/",
		emitida,
	};

	it("a los 9:59 vale; a los 10:01, ya no", () => {
		const valor = cifrarEntrada(llave, entrada);
		expect(descifrarEntrada(llave, valor, emitida + 599_000)).toEqual(entrada);
		expect(descifrarEntrada(llave, valor, emitida + 601_000)).toBeUndefined();
	});

	it("con otra llave, con un byte cambiado o sin cookie, no se lee; el cifrado no deja ver nada", () => {
		const valor = cifrarEntrada(llave, entrada);
		expect(
			descifrarEntrada(llaveDeLaEntrada("otra-llave-de-prueba-de-al-menos-32-letras"), valor, emitida),
		).toBeUndefined();
		const bytes = Buffer.from(valor, "base64url");
		bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 1;
		expect(descifrarEntrada(llave, bytes.toString("base64url"), emitida)).toBeUndefined();
		expect(descifrarEntrada(llave, undefined, emitida)).toBeUndefined();
		expect(Buffer.from(valor, "base64url").toString("utf8")).not.toContain("verificador");
	});
});
