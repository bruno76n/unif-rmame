/**
 * Prueba de la revisión de la sesión en cada llamada: directo y con la API.
 * Fase 5 · docs/fases/05-acceso-con-google-cuentas-y-permisos.md (parte 2)
 */

import { type BaseDePrueba, crearBaseDePrueba } from "@uniformame/pruebas/base";
import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Base, crearBase } from "../base/conexion.ts";
import { cuentaDePrueba } from "../pruebas/cuentas-de-prueba.ts";
import { crearServidorDePrueba, dominios, type ServidorDePrueba } from "../pruebas/servidor-de-prueba.ts";
import { hashDe, nuevoIdentificador } from "./cookies.ts";
import { describirAparato, revisarSesion } from "./sesion.ts";

describe("una sesión cerrada, vencida, inactiva o de una cuenta sin acceso no pasa y queda cerrada con su motivo; la actividad se escribe a lo más una vez por minuto", () => {
	let prueba: BaseDePrueba;
	let base: Base;
	const ahora = Temporal.Instant.from("2026-11-10T12:00:00Z");
	beforeAll(async () => {
		prueba = await crearBaseDePrueba();
		base = crearBase(prueba.app);
	});
	afterAll(async () => {
		await prueba.borrar();
	});

	/** Abre una sesión de prueba y regresa el identificador de su cookie. */
	async function sesion(
		usuarioId: string,
		datos: { actividad?: string; vence?: string; cerrada?: boolean } = {},
	): Promise<{ id: string; identificador: string }> {
		const id = uuidv7();
		const identificador = nuevoIdentificador();
		await prueba.dueno.query(
			`INSERT INTO sesiones (id, usuario_id, token_hash, ultima_actividad_en, vence_en, cerrada_en, motivo_cierre)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			[
				id,
				usuarioId,
				hashDe(identificador),
				datos.actividad ?? "2026-11-10T11:55:00Z",
				datos.vence ?? "2026-11-10T20:00:00Z",
				datos.cerrada === true ? "2026-11-10T11:00:00Z" : null,
				datos.cerrada === true ? "salio" : null,
			],
		);
		return { id, identificador };
	}

	/** Cómo quedó una sesión. */
	async function comoQuedo(id: string) {
		const { rows } = await prueba.dueno.query(
			"SELECT motivo_cierre, cerrada_en, ultima_actividad_en FROM sesiones WHERE id = $1",
			[id],
		);
		return rows[0];
	}

	it("una sesión abierta y reciente pasa con su cuenta; sin cookie o con una que no existe, no", async () => {
		const abierta = await sesion(cuentaDePrueba("ventas"));
		expect(await revisarSesion(base, abierta.identificador, ahora)).toEqual({
			sesionId: abierta.id,
			usuarioId: cuentaDePrueba("ventas"),
			googleConfirmadoEn: undefined,
		});
		expect(await revisarSesion(base, undefined, ahora)).toBeUndefined();
		expect(await revisarSesion(base, nuevoIdentificador(), ahora)).toBeUndefined();
	});

	it("la última actividad se escribe si pasó un minuto, y no antes", async () => {
		const reciente = await sesion(cuentaDePrueba("ventas"), { actividad: "2026-11-10T11:59:30Z" });
		await revisarSesion(base, reciente.identificador, ahora);
		expect((await comoQuedo(reciente.id))?.ultima_actividad_en).toEqual(new Date("2026-11-10T11:59:30Z"));
		const vieja = await sesion(cuentaDePrueba("ventas"), { actividad: "2026-11-10T11:58:00Z" });
		await revisarSesion(base, vieja.identificador, ahora);
		expect((await comoQuedo(vieja.id))?.ultima_actividad_en).toEqual(new Date("2026-11-10T12:00:00Z"));
	});

	it("cerrada no pasa; vencida se cierra con duracion_maxima; sin actividad en 30 minutos, con inactividad", async () => {
		const cerrada = await sesion(cuentaDePrueba("ventas"), { cerrada: true });
		expect(await revisarSesion(base, cerrada.identificador, ahora)).toBeUndefined();
		expect((await comoQuedo(cerrada.id))?.motivo_cierre).toBe("salio");
		const vencida = await sesion(cuentaDePrueba("ventas"), { vence: "2026-11-10T12:00:00Z" });
		expect(await revisarSesion(base, vencida.identificador, ahora)).toBeUndefined();
		expect(await comoQuedo(vencida.id)).toMatchObject({
			motivo_cierre: "duracion_maxima",
			cerrada_en: expect.any(Date),
		});
		const inactiva = await sesion(cuentaDePrueba("ventas"), { actividad: "2026-11-10T11:30:00Z" });
		expect(await revisarSesion(base, inactiva.identificador, ahora)).toBeUndefined();
		expect((await comoQuedo(inactiva.id))?.motivo_cierre).toBe("inactividad");
		// Un segundo antes de los 30 minutos todavía pasa.
		const casi = await sesion(cuentaDePrueba("ventas"), { actividad: "2026-11-10T11:30:01Z" });
		expect(await revisarSesion(base, casi.identificador, ahora)).toBeDefined();
	});

	it("la de una cuenta sin acceso se cierra con acceso_quitado", async () => {
		const usuarioId = uuidv7();
		await prueba.dueno.query(
			`INSERT INTO usuarios (id, persona_id, correo, estado, baja_en, baja_confirmado_con_google_en)
			 VALUES ($1, $2, 'sin.acceso@alameda.invalid', 'sin_acceso', now(), now())`,
			[usuarioId, uuidv7()],
		);
		const deSinAcceso = await sesion(usuarioId);
		expect(await revisarSesion(base, deSinAcceso.identificador, ahora)).toBeUndefined();
		expect((await comoQuedo(deSinAcceso.id))?.motivo_cierre).toBe("acceso_quitado");
	});

	it("el aparato en corto sale del agente del navegador", () => {
		expect(describirAparato("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1")).toBe(
			"iPhone · Safari",
		);
		expect(describirAparato("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Chrome/140.0 Safari/537.36")).toBe(
			"Mac · Chrome",
		);
		expect(describirAparato(undefined)).toBe("Otro aparato · otro navegador");
	});
});

describe("con la API: una sesión cerrada, vencida, inactiva o de una cuenta sin acceso responde 401 sin_sesion y queda cerrada con su motivo", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba({ sesionReal: true });
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Abre una sesión de Ventas con esa actividad y ese vencimiento, y regresa su cookie y su id. */
	async function sesionDeVentas(actividad: string, vence: string, usuarioId = cuentaDePrueba("ventas")) {
		const id = uuidv7();
		const identificador = nuevoIdentificador();
		await servidor.base.dueno.query(
			`INSERT INTO sesiones (id, usuario_id, token_hash, ultima_actividad_en, vence_en)
			 VALUES ($1, $2, $3, now() - $4::interval, now() + $5::interval)`,
			[id, usuarioId, hashDe(identificador), actividad, vence],
		);
		return { id, identificador };
	}

	/** Llama una consulta de Ventas con la cookie. */
	const consultar = (identificador: string) =>
		servidor.app.inject({
			method: "GET",
			url: "/v1/consultas/prueba.notas",
			headers: { "x-app-version": "1.0.0", origin: dominios.DOMINIO_WEB },
			cookies: { ua_sesion: identificador },
		});

	it("una sesión al día pasa; vencida, inactiva o de una cuenta sin acceso, 401 sin_sesion con su motivo; cerrada, sigue 401", async () => {
		const buena = await sesionDeVentas("1 minute", "1 hour");
		expect((await consultar(buena.identificador)).statusCode).toBe(200);
		const usuarioId = uuidv7();
		await servidor.base.dueno.query(
			`INSERT INTO usuarios (id, persona_id, correo, estado, baja_en, baja_confirmado_con_google_en)
			 VALUES ($1, $2, 'sin.acceso.api@alameda.invalid', 'sin_acceso', now(), now())`,
			[usuarioId, uuidv7()],
		);
		const casos = [
			[await sesionDeVentas("1 minute", "-1 minute"), "duracion_maxima"],
			[await sesionDeVentas("31 minutes", "1 hour"), "inactividad"],
			[await sesionDeVentas("1 minute", "1 hour", usuarioId), "acceso_quitado"],
		] as const;
		for (const [sesion, motivo] of casos) {
			const respuesta = await consultar(sesion.identificador);
			expect([respuesta.statusCode, respuesta.json().error]).toEqual([401, "sin_sesion"]);
			const { rows } = await servidor.base.dueno.query("SELECT motivo_cierre FROM sesiones WHERE id = $1", [sesion.id]);
			expect(rows[0]?.motivo_cierre).toBe(motivo);
			expect((await consultar(sesion.identificador)).statusCode).toBe(401);
		}
	});
});
