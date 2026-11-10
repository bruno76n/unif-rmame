/**
 * Prueba del simulador de R2.
 * Fase 2 · docs/fases/02-base-de-datos-y-pruebas.md (parte 4)
 */

import { createHash } from "node:crypto";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { crearSimuladorDeR2 } from "./r2.ts";

let ahora = Date.UTC(2026, 10, 10, 18, 0, 0);
const simulador = crearSimuladorDeR2("cuenta-prueba", () => ahora);
const servidor = setupServer(...simulador.manejadores);
const objeto = "https://cuenta-prueba.r2.cloudflarestorage.com/archivos/comprobantes/R-0452.pdf";

/**
 * Una dirección firmada como la que da la API: firmada a las 18:00 del 10 de noviembre y válida 5 minutos.
 * Con `conSuma`, la firma incluye la suma, así que la subida tiene que mandarla.
 */
function firmada(url: string, conSuma = false): string {
	const direccion = new URL(url);
	direccion.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
	direccion.searchParams.set("X-Amz-Credential", "llave/20261110/auto/s3/aws4_request");
	direccion.searchParams.set("X-Amz-Date", "20261110T180000Z");
	direccion.searchParams.set("X-Amz-Expires", "300");
	direccion.searchParams.set("X-Amz-SignedHeaders", conSuma ? "host;x-amz-checksum-sha256" : "host");
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

	it("con su suma SHA-256, sube si el contenido la da y rechaza otro contenido; HEAD regresa la suma y el ETag es el MD5", async () => {
		const contenido = "comprobante de pago";
		const suma = createHash("sha256").update(contenido).digest("base64");
		const conSuma = firmada(`${objeto}.suma`, true);
		expect(
			(await fetch(conSuma, { method: "PUT", body: "otra cosa", headers: { "x-amz-checksum-sha256": suma } })).status,
		).toBe(400);
		expect((await fetch(conSuma, { method: "PUT", body: contenido })).status).toBe(400);
		const subida = await fetch(conSuma, { method: "PUT", body: contenido, headers: { "x-amz-checksum-sha256": suma } });
		expect(subida.status).toBe(200);
		expect(subida.headers.get("etag")).toBe(`"${createHash("md5").update(contenido).digest("hex")}"`);
		const revision = await fetch(firmada(`${objeto}.suma`), { method: "HEAD" });
		expect(revision.headers.get("x-amz-checksum-sha256")).toBe(suma);
	});

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

	it("puesto a fallar: sin respuesta, con error del servidor, con demasiadas peticiones o tarde", {
		timeout: 10_000,
	}, async () => {
		simulador.ponerAFallar("sin_respuesta");
		await expect(fetch(firmada(objeto))).rejects.toThrow();
		simulador.ponerAFallar("error_del_servidor");
		const conError = await fetch(firmada(objeto));
		expect(conError.status).toBe(500);
		expect(await conError.text()).toContain("<Code>InternalError</Code>");
		simulador.ponerAFallar("demasiadas_peticiones");
		const limite = await fetch(firmada(objeto));
		expect(limite.status).toBe(503);
		expect(await limite.text()).toContain("<Code>SlowDown</Code>");
		simulador.ponerAFallar("lento");
		const inicio = performance.now();
		await fetch(firmada(objeto));
		expect(performance.now() - inicio).toBeGreaterThanOrEqual(2900);
	});
});
