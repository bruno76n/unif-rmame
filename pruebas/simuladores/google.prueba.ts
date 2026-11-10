/**
 * Prueba del simulador de Google.
 * Fase 2 · docs/fases/02-base-de-datos-y-pruebas.md (parte 4)
 */

import { createHash, createPublicKey, verify } from "node:crypto";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { crearSimuladorDeGoogle, cuentasDeGoogle, emisorDeGoogle } from "./google.ts";

const clienteId = "uniformame-pruebas.apps.googleusercontent.com";
const simulador = crearSimuladorDeGoogle(clienteId);
const servidor = setupServer(...simulador.manejadores);

/** Cambia un código en el punto de tokens que dice el descubrimiento. */
async function cambiarCodigo(codigo: string, verificador?: string): Promise<Response> {
	const descubrimiento = z
		.object({ token_endpoint: z.url() })
		.parse(await (await fetch(`${emisorDeGoogle}/.well-known/openid-configuration`)).json());
	return fetch(descubrimiento.token_endpoint, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			code: codigo,
			client_id: clienteId,
			client_secret: "secreto-de-prueba",
			redirect_uri: "http://localhost:5173/acceso",
			...(verificador === undefined ? {} : { code_verifier: verificador }),
		}),
	});
}

describe("cada simulador responde como su servicio y, puesto a fallar, falla como su servicio: Google", () => {
	beforeAll(() => servidor.listen({ onUnhandledFrame: "error" }));
	afterEach(() => simulador.ponerAFallar("ninguna"));
	afterAll(() => servidor.close());

	it("cambia un código por un id_token firmado con la llave que publica, con el nonce y la cuenta", async () => {
		const verificador = "un-verificador-de-pkce-suficientemente-largo-0123456789";
		const reto = createHash("sha256").update(verificador).digest("base64url");
		const codigo = simulador.emitirCodigo(cuentasDeGoogle.duena, { nonce: "n-1", retoPkce: reto });
		const respuesta = await cambiarCodigo(codigo, verificador);
		expect(respuesta.status).toBe(200);
		const { id_token: idToken } = z.object({ id_token: z.string() }).parse(await respuesta.json());
		const [encabezado = "", contenido = "", firma = ""] = idToken.split(".");
		const { kid } = z.object({ kid: z.string() }).parse(JSON.parse(Buffer.from(encabezado, "base64url").toString()));
		const { keys } = z
			.object({ keys: z.array(z.looseObject({ kid: z.string() })) })
			.parse(await (await fetch("https://www.googleapis.com/oauth2/v3/certs")).json());
		const llave = keys.find((k) => k.kid === kid) ?? {};
		const valida = verify(
			"RSA-SHA256",
			Buffer.from(`${encabezado}.${contenido}`),
			createPublicKey({ key: llave, format: "jwk" }),
			Buffer.from(firma, "base64url"),
		);
		expect(valida).toBe(true);
		const datos = JSON.parse(Buffer.from(contenido, "base64url").toString());
		expect(datos).toMatchObject({
			iss: emisorDeGoogle,
			aud: clienteId,
			email: cuentasDeGoogle.duena.email,
			nonce: "n-1",
			email_verified: true,
		});
	});

	it("un código se usa una sola vez, y un verificador PKCE equivocado no sirve", async () => {
		const codigo = simulador.emitirCodigo(cuentasDeGoogle.dadaDeAlta);
		expect((await cambiarCodigo(codigo)).status).toBe(200);
		const repetido = await cambiarCodigo(codigo);
		expect(repetido.status).toBe(400);
		expect(await repetido.json()).toMatchObject({ error: "invalid_grant" });
		const conReto = simulador.emitirCodigo(cuentasDeGoogle.noExiste, { retoPkce: "otro-reto" });
		expect((await cambiarCodigo(conReto, "verificador-equivocado")).status).toBe(400);
	});

	it("puesto a fallar: sin respuesta, con error del servidor o tarde", async () => {
		simulador.ponerAFallar("sin_respuesta");
		await expect(fetch(`${emisorDeGoogle}/.well-known/openid-configuration`)).rejects.toThrow();
		simulador.ponerAFallar("error_del_servidor");
		const conError = await cambiarCodigo(simulador.emitirCodigo(cuentasDeGoogle.duena)).catch(() => undefined);
		expect(conError).toBeUndefined();
		const directo = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: "" });
		expect(directo.status).toBe(500);
		simulador.ponerAFallar("lento");
		const inicio = performance.now();
		await fetch("https://www.googleapis.com/oauth2/v3/certs");
		expect(performance.now() - inicio).toBeGreaterThanOrEqual(2900);
	});
});
