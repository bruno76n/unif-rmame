/**
 * Prueba de los intentos que llevan al `429`.
 * Fase 5 · docs/fases/05-acceso-con-google-cuentas-y-permisos.md (parte 2)
 */

import { crearSimuladorDeGoogle, cuentasDeGoogle } from "@uniformame/pruebas/simuladores/google";
import { setupServer } from "msw/node";
import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../base/conexion.ts";
import { entrarConGoogle } from "../pruebas/google.ts";
import { clienteDeGooglePrueba, crearServidorDePrueba, type ServidorDePrueba } from "../pruebas/servidor-de-prueba.ts";
import { anotarFalla, bloqueadaHasta } from "./intentos.ts";

const simulador = crearSimuladorDeGoogle({ id: clienteDeGooglePrueba.id, secreto: clienteDeGooglePrueba.secreto });
const red = setupServer(...simulador.manejadores);

describe("después de admin.intentos_entrada_max fallas desde una IP responde 429 hasta que pasa la ventana, también con dos instancias de la API", () => {
	let servidor: ServidorDePrueba;
	let otra: ServidorDePrueba;
	beforeAll(async () => {
		red.listen({ onUnhandledFrame: "error" });
		servidor = await crearServidorDePrueba({ conGoogle: true });
		otra = await crearServidorDePrueba({ conGoogle: true, otraInstanciaDe: servidor });
		await servidor.base.dueno.query(
			"UPDATE parametros SET valor_entero = 3 WHERE clave IN ('admin.intentos_entrada_max', 'admin.minutos_ventana_intentos')",
		);
	});
	afterAll(async () => {
		red.close();
		await otra.cerrar();
		await servidor.cerrar();
	});

	it("tres fallas repartidas entre las dos instancias bloquean la IP en las dos; otra IP sigue entrando", async () => {
		const ip = "192.0.2.15";
		for (const instancia of [servidor, otra, servidor]) {
			const falla = await entrarConGoogle(instancia, simulador, cuentasDeGoogle.noExiste, { ip });
			expect(falla.ubicacion).toContain("error=sin_acceso");
		}
		for (const instancia of [servidor, otra]) {
			const bloqueada = await instancia.app.inject({ method: "GET", url: "/v1/acceso/google", remoteAddress: ip });
			expect(bloqueada.statusCode).toBe(429);
			expect(bloqueada.json()).toMatchObject({ error: "demasiados_intentos", reintentar_en: expect.any(String) });
		}
		// Con el código de una cuenta que sí entra, tampoco: la vuelta también revisa.
		const conCuentaBuena = await entrarConGoogle(otra, simulador, cuentasDeGoogle.dadaDeAlta, { ip });
		expect(conCuentaBuena.estado).toBe(429);
		const otraIp = await entrarConGoogle(servidor, simulador, cuentasDeGoogle.dadaDeAlta, { ip: "192.0.2.16" });
		expect(otraIp.estado).toBe(302);
		expect(otraIp.ubicacion).not.toContain("error=");
	});

	it("al pasar la ventana se puede volver a intentar, y la cuenta empieza de nuevo", async () => {
		const base = crearBase(servidor.base.app);
		const limite = { maximo: 2, minutos: 15 };
		const clave = "entrada:192.0.2.40";
		const inicio = Temporal.Instant.from("2026-11-10T10:00:00Z");
		await anotarFalla(base, clave, inicio, limite);
		expect(await bloqueadaHasta(base, clave, inicio.add({ minutes: 1 }), limite)).toBeUndefined();
		await anotarFalla(base, clave, inicio.add({ minutes: 2 }), limite);
		expect(await bloqueadaHasta(base, clave, inicio.add({ minutes: 14 }), limite)).toBe("2026-11-10T10:15:00.000Z");
		expect(await bloqueadaHasta(base, clave, inicio.add({ minutes: 15 }), limite)).toBeUndefined();
		// La ventana pasó: una falla nueva cuenta uno y no bloquea.
		await anotarFalla(base, clave, inicio.add({ minutes: 16 }), limite);
		expect(await bloqueadaHasta(base, clave, inicio.add({ minutes: 17 }), limite)).toBeUndefined();
		const { rows } = await servidor.base.dueno.query("SELECT intentos FROM intentos_recientes WHERE clave = $1", [
			clave,
		]);
		expect(rows[0]?.intentos).toBe(1);
	});

	it("dos fallas a la vez desde dos instancias cuentan las dos", async () => {
		const base = crearBase(servidor.base.app);
		const deLaOtra = crearBase(otra.base.app);
		const limite = { maximo: 2, minutos: 15 };
		const clave = "entrada:192.0.2.50";
		const ahora = Temporal.Instant.from("2026-11-10T11:00:00Z");
		await Promise.all([anotarFalla(base, clave, ahora, limite), anotarFalla(deLaOtra, clave, ahora, limite)]);
		expect(await bloqueadaHasta(base, clave, ahora, limite)).toBe("2026-11-10T11:15:00.000Z");
	});
});
