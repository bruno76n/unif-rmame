/**
 * Prueba del simulador de Resend.
 * Fase 2 · docs/fases/02-base-de-datos-y-pruebas.md (parte 4)
 */

import { setupServer } from "msw/node";
import { z } from "zod";

/** La respuesta de un envío: su id. */
const enviado = z.object({ id: z.string() });

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { crearSimuladorDeResend, envioDeResend } from "./resend.ts";

const simulador = crearSimuladorDeResend();
const servidor = setupServer(...simulador.manejadores);
const llaveDePrueba = `re_${"prueba"}_${"x".repeat(20)}`;

/** Manda un correo como lo manda el worker. */
function mandar(cuerpo: unknown, encabezados: Record<string, string> = {}): Promise<Response> {
	return fetch(envioDeResend, {
		method: "POST",
		headers: { authorization: `Bearer ${llaveDePrueba}`, "content-type": "application/json", ...encabezados },
		body: JSON.stringify(cuerpo),
	});
}

const correo = {
	from: "avisos@alameda.invalid",
	to: "duena@alameda.invalid",
	subject: "Respaldo semanal",
	html: "<p>Listo</p>",
};

describe("cada simulador responde como su servicio y, puesto a fallar, falla como su servicio: Resend", () => {
	beforeAll(() => servidor.listen({ onUnhandledFrame: "error" }));
	afterEach(() => simulador.ponerAFallar("ninguna"));
	afterAll(() => servidor.close());

	it("guarda el correo y contesta su id", async () => {
		const respuesta = await mandar(correo);
		expect(respuesta.status).toBe(200);
		const { id } = enviado.parse(await respuesta.json());
		expect(simulador.correos.at(-1)).toMatchObject({ id, to: ["duena@alameda.invalid"], subject: "Respaldo semanal" });
	});

	it("la misma clave de idempotencia contesta el mismo id sin mandar dos veces; con otro cuerpo, 409", async () => {
		const antes = simulador.correos.length;
		const una = enviado.parse(await (await mandar(correo, { "idempotency-key": "aviso-1" })).json());
		const otra = enviado.parse(await (await mandar(correo, { "idempotency-key": "aviso-1" })).json());
		expect(otra.id).toBe(una.id);
		expect(simulador.correos.length).toBe(antes + 1);
		expect((await mandar({ ...correo, subject: "otro" }, { "idempotency-key": "aviso-1" })).status).toBe(409);
	});

	it("sin llave contesta 401 y sin campos obligatorios 422, con la forma de error de Resend", async () => {
		const sinLlave = await fetch(envioDeResend, { method: "POST", body: JSON.stringify(correo) });
		expect(sinLlave.status).toBe(401);
		const incompleto = await mandar({ from: correo.from });
		expect(incompleto.status).toBe(422);
		expect(await incompleto.json()).toMatchObject({ statusCode: 422, name: "validation_error" });
	});

	it("puesto a fallar: sin respuesta o con error del servidor", async () => {
		simulador.ponerAFallar("sin_respuesta");
		await expect(mandar(correo)).rejects.toThrow();
		simulador.ponerAFallar("error_del_servidor");
		const conError = await mandar(correo);
		expect(conError.status).toBe(500);
		expect(await conError.json()).toMatchObject({ name: "application_error" });
	});
});
