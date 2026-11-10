/**
 * Prueba de la clave de idempotencia.
 * Fase 3 · docs/fases/03-api-protocolo-e-idempotencia.md (parte 3)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contar, mandarAccion, nuevaClave } from "../pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../pruebas/servidor-de-prueba.ts";

describe("la misma clave dos veces escribe una vez y contesta lo mismo; dos a la vez, también; con otros datos, clave_usada; después de fallar, el reintento sí aplica", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("la misma clave dos veces escribe una vez y contesta lo mismo", async () => {
		const antes = await contar(servidor, "prueba_notas");
		const clave = nuevaClave();
		const datos = { texto: "PE-0150", monto_centavos: 2_500 };
		const primera = await mandarAccion(servidor, "prueba.crear_nota", { clave, datos });
		const segunda = await mandarAccion(servidor, "prueba.crear_nota", { clave, datos });
		expect(primera.estado).toBe(200);
		expect(segunda).toEqual(primera);
		expect(await contar(servidor, "prueba_notas")).toBe(antes + 1);
	});

	it("dos a la vez con la misma clave: una escribe, la otra espera y contesta lo mismo", async () => {
		const antes = await contar(servidor, "prueba_notas");
		const clave = nuevaClave();
		const datos = { texto: "a la vez", monto_centavos: 1 };
		const [una, otra] = await Promise.all([
			mandarAccion(servidor, "prueba.crear_nota", { clave, datos }),
			mandarAccion(servidor, "prueba.crear_nota", { clave, datos }),
		]);
		expect(una.estado).toBe(200);
		expect(otra).toEqual(una);
		expect(await contar(servidor, "prueba_notas")).toBe(antes + 1);
	});

	it("la misma clave con otros datos responde 422 clave_usada y no escribe", async () => {
		const clave = nuevaClave();
		await mandarAccion(servidor, "prueba.crear_nota", { clave, datos: { texto: "uno", monto_centavos: 1 } });
		const antes = await contar(servidor, "prueba_notas");
		const otra = await mandarAccion(servidor, "prueba.crear_nota", {
			clave,
			datos: { texto: "dos", monto_centavos: 1 },
		});
		expect(otra.estado).toBe(422);
		expect(otra.cuerpo).toMatchObject({
			error: "regla",
			codigo: "clave_usada",
			mensaje: "Esa operación ya se mandó con otros datos. Recarga la pantalla.",
		});
		expect(await contar(servidor, "prueba_notas")).toBe(antes);
	});

	it("después de fallar, el reintento con la misma clave sí aplica", async () => {
		const clave = nuevaClave();
		servidor.fallas.bitacora = true;
		expect(
			(await mandarAccion(servidor, "prueba.crear_nota", { clave, datos: { texto: "reintento", monto_centavos: 1 } }))
				.estado,
		).toBe(500);
		servidor.fallas.bitacora = false;
		const antes = await contar(servidor, "prueba_notas");
		expect(
			(await mandarAccion(servidor, "prueba.crear_nota", { clave, datos: { texto: "reintento", monto_centavos: 1 } }))
				.estado,
		).toBe(200);
		expect(await contar(servidor, "prueba_notas")).toBe(antes + 1);
	});
});
