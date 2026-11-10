/**
 * Prueba de la forma de una acción: la respuesta correcta y la de validación.
 * Fase 3 · docs/fases/03-api-protocolo-e-idempotencia.md (parte 1)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearServidorDePrueba, encabezadosDeLaWeb, type ServidorDePrueba } from "../pruebas/servidor-de-prueba.ts";

describe("una acción válida responde { ok, resultado, avisos } con su resultado.mensaje; una inválida, 400 con cada campo y su mensaje en español", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("una acción válida responde ok, su resultado con mensaje, y avisos", async () => {
		const respuesta = await servidor.app.inject({
			method: "POST",
			url: "/v1/acciones/prueba.crear_nota",
			headers: encabezadosDeLaWeb(),
			payload: {
				clave_idempotencia: "01936f2e-8c3a-7b4d-9e5f-0000000a0001",
				datos: { texto: "PE-0145", monto_centavos: 125_000 },
			},
		});
		expect(respuesta.statusCode).toBe(200);
		const cuerpo = respuesta.json();
		expect(cuerpo).toMatchObject({ ok: true, avisos: [], resultado: { mensaje: "Nota PE-0145 creada" } });
		expect(respuesta.headers["cache-control"]).toBe("no-store");
	});

	it("una inválida responde 400 con cada campo y su mensaje en español", async () => {
		const respuesta = await servidor.app.inject({
			method: "POST",
			url: "/v1/acciones/prueba.crear_nota",
			headers: encabezadosDeLaWeb(),
			payload: { clave_idempotencia: "no-es-uuid", datos: { texto: "", monto_centavos: -1, sobra: 1 } },
		});
		expect(respuesta.statusCode).toBe(400);
		const cuerpo = respuesta.json();
		expect(cuerpo).toMatchObject({ ok: false, error: "validacion", codigo: null });
		expect(cuerpo.campos.texto).toBe("Escribe el texto");
		expect(cuerpo.campos.monto_centavos).toMatch(/[a-záéíóú]/);
		expect(cuerpo.campos.sobra).toContain("desconocida");
		expect(cuerpo.campos.clave_idempotencia).toBeDefined();
	});
});
