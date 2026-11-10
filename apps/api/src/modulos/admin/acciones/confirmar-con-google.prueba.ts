/**
 * Prueba de «Confirmar con Google» (`GET /v1/acceso/google?proposito=confirmar` y su vuelta).
 * Fase 5 · docs/fases/05-acceso-con-google-cuentas-y-permisos.md (partes 2 y 4)
 */

import { type CuentaDeGoogle, crearSimuladorDeGoogle } from "@uniformame/pruebas/simuladores/google";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { entrarConGoogle } from "../../../nucleo/pruebas/google.ts";
import { darDeAltaCuenta } from "../../../nucleo/pruebas/llamadas.ts";
import {
	clienteDeGooglePrueba,
	crearServidorDePrueba,
	type ServidorDePrueba,
} from "../../../nucleo/pruebas/servidor-de-prueba.ts";

const simulador = crearSimuladorDeGoogle({ id: clienteDeGooglePrueba.id, secreto: clienteDeGooglePrueba.secreto });
const red = setupServer(...simulador.manejadores);

describe("«Confirmar con Google» pide la misma cuenta de Google y una entrada de los últimos 5 minutos, y la guarda en la sesión", () => {
	let servidor: ServidorDePrueba;
	const lucia: CuentaDeGoogle = { sub: "100000000000000000088", email: "lucia@alameda.invalid", name: "Lucía" };
	let sesion = "";
	beforeAll(async () => {
		red.listen({ onUnhandledFrame: "error" });
		servidor = await crearServidorDePrueba({ conGoogle: true });
		await darDeAltaCuenta(servidor, lucia.email, ["compras"]);
		const entrada = await entrarConGoogle(servidor, simulador, lucia);
		sesion = entrada.cookies.ua_sesion?.valor ?? "";
	});
	afterAll(async () => {
		red.close();
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
