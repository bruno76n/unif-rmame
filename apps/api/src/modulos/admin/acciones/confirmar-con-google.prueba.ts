/**
 * Prueba de «Confirmar con Google» (`GET /v1/acceso/google?proposito=confirmar` y su vuelta).
 * Fase 5 · docs/fases/05-acceso-con-google-cuentas-y-permisos.md (partes 2 y 4)
 */

import { type CuentaDeGoogle, crearSimuladorDeGoogle } from "@uniformame/pruebas/simuladores/google";
import { setupServer } from "msw/node";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { entrarConGoogle } from "../../../nucleo/pruebas/google.ts";
import { darDeAltaCuenta } from "../../../nucleo/pruebas/llamadas.ts";
import { nuevaPersona } from "../../../nucleo/pruebas/personas-de-prueba.ts";
import {
	clienteDeGooglePrueba,
	crearServidorDePrueba,
	dominios,
	type ServidorDePrueba,
} from "../../../nucleo/pruebas/servidor-de-prueba.ts";

const simulador = crearSimuladorDeGoogle({ id: clienteDeGooglePrueba.id, secreto: clienteDeGooglePrueba.secreto });
const red = setupServer(...simulador.manejadores);
beforeAll(() => red.listen({ onUnhandledFrame: "error" }));
afterAll(() => red.close());

describe("«Confirmar con Google» pide la misma cuenta de Google y una entrada de los últimos 5 minutos, y la guarda en la sesión", () => {
	let servidor: ServidorDePrueba;
	const lucia: CuentaDeGoogle = { sub: "100000000000000000088", email: "lucia@alameda.invalid", name: "Lucía" };
	let sesion = "";
	beforeAll(async () => {
		servidor = await crearServidorDePrueba({ conGoogle: true });
		await darDeAltaCuenta(servidor, lucia.email, ["compras"]);
		const entrada = await entrarConGoogle(servidor, simulador, lucia);
		sesion = entrada.cookies.ua_sesion?.valor ?? "";
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Cuándo confirmó con Google la sesión de Lucía. */
	async function confirmadoEn(): Promise<Date | null> {
		const { rows } = await servidor.base.dueno.query(
			"SELECT s.google_confirmado_en FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE u.correo = $1",
			[lucia.email],
		);
		return rows[0]?.google_confirmado_en ?? null;
	}

	it("sin sesión abierta responde 401 sin_sesion", async () => {
		const ida = await servidor.app.inject({ method: "GET", url: "/v1/acceso/google?proposito=confirmar" });
		expect(ida.statusCode).toBe(401);
		expect(ida.json()).toMatchObject({ error: "sin_sesion" });
	});

	it("la ida abre Google con login_hint y max_age de 5 minutos", async () => {
		const ida = await servidor.app.inject({
			method: "GET",
			url: "/v1/acceso/google?proposito=confirmar",
			cookies: { ua_sesion: sesion },
		});
		expect(ida.statusCode).toBe(302);
		const aGoogle = new URL(String(ida.headers.location));
		expect(aGoogle.searchParams.get("login_hint")).toBe(lucia.email);
		expect(aGoogle.searchParams.get("max_age")).toBe("300");
	});

	it("con otra cuenta de Google no vale: otra_cuenta y la sesión no queda confirmada", async () => {
		const otra: CuentaDeGoogle = { sub: "100000000000000000099", email: "otra@alameda.invalid", name: "Otra" };
		const vuelta = await entrarConGoogle(servidor, simulador, otra, {
			proposito: "confirmar",
			cookies: { ua_sesion: sesion },
		});
		expect(vuelta.ubicacion).toBe("https://fabrica.prueba.invalid/acceso/confirmado?error=otra_cuenta");
		expect(await confirmadoEn()).toBeNull();
	});

	it("una entrada a Google de hace más de 5 minutos no vale", async () => {
		const vuelta = await entrarConGoogle(servidor, simulador, lucia, {
			proposito: "confirmar",
			cookies: { ua_sesion: sesion },
			authTime: Math.floor(Date.now() / 1000) - 6 * 60,
		});
		expect(vuelta.ubicacion).toBe("https://fabrica.prueba.invalid/acceso/confirmado?error=google_fallo");
		expect(await confirmadoEn()).toBeNull();
	});

	it("con la misma cuenta y una entrada reciente, la sesión guarda su auth_time y regresa a la ventana", async () => {
		const authTime = Math.floor(Date.now() / 1000) - 30;
		const vuelta = await entrarConGoogle(servidor, simulador, lucia, {
			proposito: "confirmar",
			cookies: { ua_sesion: sesion },
			authTime,
		});
		expect(vuelta.ubicacion).toBe("https://fabrica.prueba.invalid/acceso/confirmado");
		expect(vuelta.cookies.ua_sesion).toBeUndefined();
		expect(await confirmadoEn()).toEqual(new Date(authTime * 1000));
	});
});

describe("una acción que pide «Confirmar con Google» responde 401 reautenticar sin una confirmación de los últimos 5 minutos, y pasa con ella; la confirmación con otra cuenta de Google no vale", () => {
	let servidor: ServidorDePrueba;
	const carmen: CuentaDeGoogle = { sub: "100000000000000000001", email: "carmen@uniformesalameda.mx", name: "Carmen" };
	let sesion = "";
	beforeAll(async () => {
		servidor = await crearServidorDePrueba({ conGoogle: true, sesionReal: true });
		sesion = (await entrarConGoogle(servidor, simulador, carmen)).cookies.ua_sesion?.valor ?? "";
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** La dueña da de alta una cuenta con su sesión de verdad. */
	const darDeAlta = async (correo: string) =>
		servidor.app.inject({
			method: "POST",
			url: "/v1/acciones/admin.crear_cuenta",
			headers: { "x-app-version": "1.0.0", origin: dominios.DOMINIO_WEB },
			cookies: { ua_sesion: sesion },
			payload: {
				clave_idempotencia: uuidv7(),
				datos: { persona_id: await nuevaPersona(servidor.base.dueno), correo, departamentos: ["ventas"] },
			},
		});

	it("sin confirmar, 401 reautenticar; con otra cuenta de Google, sigue igual; con la suya, pasa y guarda su confirmación", async () => {
		const sinConfirmar = await darDeAlta("nueva.uno@alameda.invalid");
		expect(sinConfirmar.statusCode).toBe(401);
		expect(sinConfirmar.json()).toMatchObject({ error: "reautenticar", proposito: "crear_cuenta", minutos: 5 });
		const otra: CuentaDeGoogle = { sub: "100000000000000000123", email: "otra.mas@alameda.invalid", name: "Otra" };
		await entrarConGoogle(servidor, simulador, otra, { proposito: "confirmar", cookies: { ua_sesion: sesion } });
		expect((await darDeAlta("nueva.uno@alameda.invalid")).statusCode).toBe(401);
		const authTime = Math.floor(Date.now() / 1000) - 10;
		const confirmada = await entrarConGoogle(servidor, simulador, carmen, {
			proposito: "confirmar",
			cookies: { ua_sesion: sesion },
			authTime,
		});
		expect(confirmada.ubicacion).toBe("https://fabrica.prueba.invalid/acceso/confirmado");
		const conConfirmacion = await darDeAlta("nueva.uno@alameda.invalid");
		expect(conConfirmacion.statusCode).toBe(200);
		const { rows } = await servidor.base.dueno.query(
			"SELECT confirmado_con_google_en FROM usuarios WHERE correo = 'nueva.uno@alameda.invalid'",
		);
		expect(rows[0]?.confirmado_con_google_en).toEqual(new Date(authTime * 1000));
	});

	it("una confirmación de hace más de 5 minutos ya no vale", async () => {
		await servidor.base.dueno.query(
			"UPDATE sesiones SET google_confirmado_en = now() - interval '6 minutes' WHERE usuario_id = $1 AND cerrada_en IS NULL",
			["01936f2e-0000-7000-8000-000000000001"],
		);
		expect((await darDeAlta("nueva.dos@alameda.invalid")).statusCode).toBe(401);
	});
});
