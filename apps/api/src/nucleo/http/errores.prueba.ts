/**
 * Prueba de la tabla de errores de la API.
 * Fase 3 · docs/fases/03-api-protocolo-e-idempotencia.md (parte 1)
 */

import { tablaDeErrores } from "@uniformame/compartido/contratos/protocolo";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearServidorDePrueba, encabezadosDeLaWeb, type ServidorDePrueba } from "../pruebas/servidor-de-prueba.ts";

describe("cada error de la tabla de la API sale con su forma y su mensaje; un 500 no enseña la causa y su referencia está en el registro técnico", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Manda una acción con los encabezados de la web. */
	function accion(nombre: string, datos: unknown, quien = "ventas", extra: Record<string, unknown> = {}) {
		return servidor.app.inject({
			method: "POST",
			url: `/v1/acciones/${nombre}`,
			headers: encabezadosDeLaWeb(quien),
			payload: { clave_idempotencia: crypto.randomUUID().replace(/^(.{14})./, "$17"), datos, ...extra },
		});
	}

	it("401 sin_sesion cuando nadie se identifica", async () => {
		const respuesta = await servidor.app.inject({ method: "POST", url: "/v1/acciones/prueba.crear_nota", payload: {} });
		expect(respuesta.statusCode).toBe(401);
		expect(respuesta.json()).toEqual({
			ok: false,
			error: "sin_sesion",
			codigo: "sin_sesion",
			mensaje: tablaDeErrores.sin_sesion.mensaje,
		});
	});

	it("401 reautenticar con su propósito y sus minutos", async () => {
		const respuesta = await accion("prueba.confirmar", {}, "duena");
		expect(respuesta.statusCode).toBe(401);
		expect(respuesta.json()).toMatchObject({ error: "reautenticar", proposito: "probar la confirmación", minutos: 5 });
	});

	it("403 sin_permiso con su código: sin departamento y solo la dueña", async () => {
		expect((await accion("prueba.crear_nota", { texto: "x", monto_centavos: 1 }, "aduana")).json()).toMatchObject({
			error: "sin_permiso",
			codigo: "sin_departamento",
		});
		const soloDuena = await accion("prueba.confirmar", {}, "ventas");
		expect(soloDuena.statusCode).toBe(403);
		expect(soloDuena.json()).toMatchObject({ codigo: "solo_duena" });
	});

	it("404 no_existe para lo que no existe y para una ruta que no hay", async () => {
		const consulta = await servidor.app.inject({
			method: "GET",
			url: "/v1/consultas/prueba.nota?id=01936f2e-8c3a-7b4d-9e5f-0000000fffff",
			headers: encabezadosDeLaWeb(),
		});
		expect(consulta.statusCode).toBe(404);
		expect(consulta.json()).toEqual({
			ok: false,
			error: "no_existe",
			codigo: null,
			mensaje: tablaDeErrores.no_existe.mensaje,
		});
		expect((await servidor.app.inject({ method: "GET", url: "/v1/nada" })).statusCode).toBe(404);
	});

	it("413 demasiado_grande con un cuerpo de más de 1 MB", async () => {
		const respuesta = await accion("prueba.crear_nota", { texto: "x".repeat(1_100_000), monto_centavos: 1 });
		expect(respuesta.statusCode).toBe(413);
		expect(respuesta.json()).toMatchObject({
			error: "demasiado_grande",
			mensaje: tablaDeErrores.demasiado_grande.mensaje,
		});
	});

	it("422 regla con el código y el mensaje de la acción", async () => {
		const respuesta = await accion("prueba.crear_nota", { texto: "x", monto_centavos: 1, fallar: "con_regla" });
		expect(respuesta.statusCode).toBe(422);
		expect(respuesta.json()).toEqual({
			ok: false,
			error: "regla",
			codigo: "texto_prohibido",
			mensaje: "Ese texto no se puede guardar",
		});
	});

	it("426 actualizar con la versión mínima", async () => {
		const respuesta = await servidor.app.inject({
			method: "POST",
			url: "/v1/acciones/prueba.crear_nota",
			headers: { ...encabezadosDeLaWeb(), "x-app-version": "0.9.0" },
			payload: {},
		});
		expect(respuesta.statusCode).toBe(426);
		expect(respuesta.json()).toMatchObject({ error: "actualizar", version_minima: "1.0.0" });
	});

	it("429 demasiados_intentos y 503 no_disponible con su reintentar_en", async () => {
		const muchos = await accion("prueba.provocar", { error: "demasiados_intentos" });
		expect(muchos.statusCode).toBe(429);
		expect(muchos.json()).toMatchObject({ error: "demasiados_intentos", reintentar_en: "2026-11-10T16:35:00Z" });
		const fuera = await accion("prueba.provocar", { error: "no_disponible" });
		expect(fuera.statusCode).toBe(503);
		expect(fuera.json()).toMatchObject({ error: "no_disponible", mensaje: tablaDeErrores.no_disponible.mensaje });
	});

	it("500 no enseña la causa, y su referencia está en el registro técnico", async () => {
		const respuesta = await accion("prueba.provocar", { error: "interno" });
		expect(respuesta.statusCode).toBe(500);
		const cuerpo = respuesta.json();
		expect(cuerpo).toMatchObject({ ok: false, error: "error_interno", mensaje: tablaDeErrores.error_interno.mensaje });
		expect(respuesta.body).not.toContain("causa secreta");
		expect(respuesta.body).not.toContain("comandos_recibidos");
		const enElRegistro = servidor.registro.find((linea) => linea.includes(cuerpo.referencia));
		expect(enElRegistro).toContain("causa secreta");
	});

	it("409 y 400 tienen su forma (sus casos completos, en pisadas.prueba.ts y acciones.prueba.ts)", async () => {
		const creada = (await accion("prueba.crear_nota", { texto: "para editar", monto_centavos: 1 })).json();
		const vieja = await accion("prueba.editar_nota", { id: creada.resultado.id, texto: "otra" }, "ventas", {
			version: 0,
		});
		expect(vieja.statusCode).toBe(409);
		expect(vieja.json()).toMatchObject({
			error: "conflicto_version",
			mensaje: tablaDeErrores.conflicto_version.mensaje,
		});
	});

	it("un cuerpo de un tipo que no se acepta sale como 400 de forma, no como 500", async () => {
		const respuesta = await servidor.app.inject({
			method: "POST",
			url: "/v1/acciones/prueba.crear_nota",
			headers: { ...encabezadosDeLaWeb(), "content-type": "application/xml" },
			payload: "<nota/>",
		});
		expect(respuesta.statusCode).toBe(400);
		expect(respuesta.json()).toMatchObject({ error: "validacion" });
	});

	it("el registro técnico de un error de la base no trae los valores de la consulta, y de cada petición guarda la ruta sin sus parámetros", async () => {
		const respuesta = await accion("prueba.provocar", { error: "base", valor: "SECRETO-DE-LA-BASE" });
		expect(respuesta.statusCode).toBe(500);
		await servidor.app.inject({
			method: "GET",
			url: "/v1/consultas/prueba.notas?cursor=RFC-XAXX010101000",
			headers: encabezadosDeLaWeb(),
		});
		const registro = servidor.registro.join("\n");
		expect(registro).toContain(respuesta.json().referencia);
		expect(registro).not.toContain("SECRETO-DE-LA-BASE");
		expect(registro).not.toContain("RFC-XAXX010101000");
	});
});
