/**
 * Prueba del simulador de R2.
 * Fase 2 · docs/fases/02-base-de-datos-y-pruebas.md (parte 4)
 */

import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { crearSimuladorDeR2 } from "./r2.ts";

let ahora = Date.UTC(2026, 10, 10, 18, 0, 0);
const simulador = crearSimuladorDeR2("cuenta-prueba", () => ahora);
const servidor = setupServer(...simulador.manejadores);
const objeto = "https://cuenta-prueba.r2.cloudflarestorage.com/archivos/comprobantes/R-0452.pdf";

/** Una dirección firmada como la que da la API: firmada a las 18:00 del 10 de noviembre y válida 5 minutos. */
function firmada(url: string): string {
	const direccion = new URL(url);
	direccion.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
	direccion.searchParams.set("X-Amz-Credential", "llave/20261110/auto/s3/aws4_request");
	direccion.searchParams.set("X-Amz-Date", "20261110T180000Z");
	direccion.searchParams.set("X-Amz-Expires", "300");
	direccion.searchParams.set("X-Amz-SignedHeaders", "host");
	direccion.searchParams.set("X-Amz-Signature", "f".repeat(64));
	return direccion.toString();
}

describe("cada simulador responde como su servicio y, puesto a fallar, falla como su servicio: R2", () => {
	beforeAll(() => servidor.listen({ onUnhandledFrame: "error" }));
	afterEach(() => {
		simulador.ponerAFallar("ninguna");
		ahora = Date.UTC(2026, 10, 10, 18, 0, 0);
	});
	afterAll(() => servidor.close());

	it("sube con dirección firmada, revisa que llegó y lo baja igual", async () => {
		const subida = await fetch(firmada(objeto), {
			method: "PUT",
			body: "contenido del PDF",
			headers: { "content-type": "application/pdf" },
		});
		expect(subida.status).toBe(200);
		const revision = await fetch(objeto, {
			method: "HEAD",
			headers: { authorization: "AWS4-HMAC-SHA256 Credential=llave/20261110/auto/s3/aws4_request" },
		});
		expect(revision.status).toBe(200);
		expect(revision.headers.get("content-length")).toBe("17");
		const bajada = await fetch(firmada(objeto));
		expect(await bajada.text()).toBe("contenido del PDF");
	});

	it("una dirección vencida da 403, sin firma ni autorización da 403, y lo que no existe da 404", async () => {
		ahora += 6 * 60 * 1000;
		const vencida = await fetch(firmada(objeto));
		expect(vencida.status).toBe(403);
		expect(await vencida.text()).toContain("<Code>AccessDenied</Code>");
		expect((await fetch(objeto)).status).toBe(403);
		ahora = Date.UTC(2026, 10, 10, 18, 0, 0);
		const falta = await fetch(firmada(`${objeto}.otro`));
		expect(falta.status).toBe(404);
		expect(await falta.text()).toContain("<Code>NoSuchKey</Code>");
	});

	it("puesto a fallar: sin respuesta o con error del servidor", async () => {
		simulador.ponerAFallar("sin_respuesta");
		await expect(fetch(firmada(objeto))).rejects.toThrow();
		simulador.ponerAFallar("error_del_servidor");
		const conError = await fetch(firmada(objeto));
		expect(conError.status).toBe(500);
		expect(await conError.text()).toContain("<Code>InternalError</Code>");
	});
});
