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

	it("la versión entra en la huella: la misma clave y los mismos datos con otra versión responden clave_usada", async () => {
		const creada = await mandarAccion(servidor, "prueba.crear_nota", {
			datos: { texto: "versionada", monto_centavos: 1 },
		});
		const id = String((creada.cuerpo.resultado as { id: string }).id);
		const leida = await servidor.base.dueno.query("SELECT version FROM prueba_notas WHERE id = $1", [id]);
		const version = Number(leida.rows[0]?.version);
		const clave = nuevaClave();
		expect(
			(await mandarAccion(servidor, "prueba.editar_nota", { clave, datos: { id, texto: "v" }, version })).estado,
		).toBe(200);
		const otra = await mandarAccion(servidor, "prueba.editar_nota", {
			clave,
			datos: { id, texto: "v" },
			version: version + 1,
		});
		expect(otra.cuerpo).toMatchObject({ codigo: "clave_usada" });
	});

	it("otra cuenta con la misma clave y los mismos datos no recibe la respuesta guardada: clave_usada", async () => {
		const clave = nuevaClave();
		const datos = { texto: "de la dueña", monto_centavos: 1 };
		expect((await mandarAccion(servidor, "prueba.crear_nota", { clave, datos }, "duena")).estado).toBe(200);
		const deVentas = await mandarAccion(servidor, "prueba.crear_nota", { clave, datos }, "ventas");
		expect(deVentas.estado).toBe(422);
		expect(deVentas.cuerpo).toMatchObject({ codigo: "clave_usada" });
		expect(deVentas.cuerpo).not.toHaveProperty("resultado");
	});

	it("un contrato que transforma una fecha funciona, y la misma clave con otra fecha responde clave_usada", async () => {
		const clave = nuevaClave();
		const primera = await mandarAccion(servidor, "prueba.fechar", { clave, datos: { dia: "2026-11-10" } });
		expect(primera.estado).toBe(200);
		expect(primera.cuerpo).toMatchObject({ resultado: { dia_siguiente: "2026-11-11" } });
		const otraFecha = await mandarAccion(servidor, "prueba.fechar", { clave, datos: { dia: "2031-12-31" } });
		expect(otraFecha.cuerpo).toMatchObject({ codigo: "clave_usada" });
	});
});
