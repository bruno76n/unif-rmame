/**
 * Prueba del trabajo de aparatos sin sincronizar: avisa a la dueña una sola vez por episodio.
 * Fase 6 · docs/fases/06-dispositivos-y-sincronizacion.md («Criterios de terminado»)
 */

import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { escribirBitacoraConAdmin, guardarEventosConAdmin } from "../../../nucleo/acciones/corredor.ts";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { bajar, fotoCompleta } from "../../../nucleo/pruebas/bajada-de-prueba.ts";
import { cuentaDePrueba, quienesDePrueba } from "../../../nucleo/pruebas/cuentas-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import {
	contextoDeTrabajo,
	correrTrabajo,
	type DependenciasDelTrabajador,
} from "../../../nucleo/trabajos/trabajador.ts";
import { tiempoParaLeer } from "../dominio/dispositivos.ts";
import { aparatosSinSincronizar } from "./aparatos-sin-sincronizar.ts";

/** El id de la tablet de prueba. */
function tablet(): string {
	const quien = quienesDePrueba.tablet;
	if (quien?.tipo !== "aparato") throw new Error("no hay tablet de prueba");
	return quien.dispositivoId;
}

describe("un aparato sin sincronizar admin.horas_sin_sincronizar_aviso avisa a la dueña una sola vez por episodio", () => {
	let servidor: ServidorDePrueba;
	let dependencias: DependenciasDelTrabajador;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		dependencias = {
			base: crearBase(servidor.base.app),
			registro: servidor.modulos,
			servicios: { escribirBitacora: escribirBitacoraConAdmin, guardarEventos: guardarEventosConAdmin },
			enviarCorreo: async () => undefined,
			dominioWeb: "https://fabrica.prueba.invalid",
			reloj: () => Temporal.Now.instant(),
		};
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Corre el trabajo, sin periodo (como una vuelta suelta). */
	async function correr(): Promise<void> {
		await correrTrabajo(dependencias, aparatosSinSincronizar, {});
	}

	/** Los avisos de aparato sin sincronizar, con su cuenta y su texto. */
	async function avisos() {
		const { rows } = await servidor.base.dueno.query(
			"SELECT usuario_id, texto, entidad_id FROM avisos WHERE tipo = 'dispositivo_sin_sincronizar' ORDER BY creado_en",
		);
		return rows;
	}

	it("el tiempo se lee en horas hasta dos días y luego en días", () => {
		expect([1, 5, 47, 48, 80].map(tiempoParaLeer)).toEqual(["1 hora", "5 horas", "47 horas", "2 días", "3 días"]);
	});

	it("avisa al pasar el tiempo, no antes ni dos veces; la bajada completa acaba el episodio y el siguiente avisa otra vez", async () => {
		const { rows } = await servidor.base.dueno.query(
			"SELECT u.nombre FROM ubicaciones u JOIN dispositivos d ON d.ubicacion_id = u.id WHERE d.id = $1",
			[tablet()],
		);
		const ubicacion = String(rows[0]?.nombre);
		const sincronizada = async (horas: number) =>
			servidor.base.dueno.query(
				`UPDATE dispositivos_sync SET ultima_sincronizacion_en = now() - make_interval(hours => $2) WHERE dispositivo_id = $1`,
				[tablet(), horas],
			);
		// Los demás aparatos de prueba se sincronizaron hace poco: no cuentan aquí.
		await servidor.base.dueno.query("UPDATE dispositivos_sync SET ultima_sincronizacion_en = now()");
		await sincronizada(3);
		await correr();
		expect(await avisos()).toEqual([]);
		await sincronizada(5);
		await correr();
		await correr();
		expect(await avisos()).toEqual([
			{
				usuario_id: cuentaDePrueba("duena"),
				texto: `Tablet del taller sin sincronizar desde hace 5 horas: ${ubicacion} · ventas y existencia sin enviar`,
				entidad_id: tablet(),
			},
		]);
		const marcado = await servidor.base.dueno.query(
			"SELECT aviso_sin_sincronizar_en FROM dispositivos_sync WHERE dispositivo_id = $1",
			[tablet()],
		);
		expect(marcado.rows[0]?.aviso_sin_sincronizar_en).toEqual(expect.any(Date));
		const evento = await servidor.base.dueno.query(
			"SELECT tablas FROM eventos WHERE tipo = 'dispositivo.sin_sincronizar' AND entidad_id = $1",
			[tablet()],
		);
		expect(evento.rows).toEqual([{ tablas: ["dispositivos"] }]);
		// La tablet vuelve a sincronizar completa: el episodio acaba.
		const { cursor } = await fotoCompleta(servidor);
		await bajar(servidor, cursor, { pendientes: 0 });
		await servidor.base.dueno.query("UPDATE avisos SET leido_en = now() WHERE tipo = 'dispositivo_sin_sincronizar'");
		await correr();
		expect(await avisos()).toHaveLength(1);
		// Otro episodio: vuelve a avisar.
		await sincronizada(50);
		await correr();
		const todos = await avisos();
		expect(todos).toHaveLength(2);
		expect(todos[1]?.texto).toBe(
			`Tablet del taller sin sincronizar desde hace 2 días: ${ubicacion} · ventas y existencia sin enviar`,
		);
	});

	it("admin.ultima_sincronizacion da, por ubicación y tipo, la del aparato vigente más reciente", async () => {
		const { rows } = await servidor.base.dueno.query(
			"UPDATE dispositivos_sync SET ultima_sincronizacion_en = '2026-11-10T12:00:00Z' WHERE dispositivo_id = $1 RETURNING dispositivo_id",
			[tablet()],
		);
		expect(rows).toHaveLength(1);
		const ubicacion = (
			await servidor.base.dueno.query("SELECT ubicacion_id FROM dispositivos WHERE id = $1", [tablet()])
		).rows[0]?.ubicacion_id;
		const leer = (datos: unknown) =>
			contextoDeTrabajo(dependencias, "prueba").enTransaccion((contexto) =>
				contexto.lectura("admin.ultima_sincronizacion", datos),
			);
		expect(await leer({ ubicacion_id: ubicacion, tipo: "tablet_taller" })).toEqual([
			{
				ubicacion_id: ubicacion,
				tipo: "tablet_taller",
				dispositivo_id: tablet(),
				ultima_sincronizacion_en: expect.stringMatching(/^2026-11-10/),
			},
		]);
		// Todas: una por ubicación y tipo.
		const todas = z.array(z.object({ ubicacion_id: z.string().nullable(), tipo: z.string() })).parse(await leer({}));
		expect(new Set(todas.map((una) => `${una.ubicacion_id}:${una.tipo}`)).size).toBe(todas.length);
	});

	it("un aparato revocado o que no sincroniza (el puente) no avisa", async () => {
		// Los aparatos de prueba (la tablet de la muestra no es de este caso).
		const deLaPrueba = (["tablet", "puente", "otro_puente"] as const).flatMap((nombre) => {
			const quien = quienesDePrueba[nombre];
			return quien?.tipo === "aparato" ? [quien.dispositivoId] : [];
		});
		await servidor.base.dueno.query(
			"UPDATE dispositivos_sync SET ultima_sincronizacion_en = now() - interval '9 hours', aviso_sin_sincronizar_en = NULL WHERE dispositivo_id = ANY($1)",
			[deLaPrueba],
		);
		await servidor.base.dueno.query(
			`UPDATE dispositivos SET baja_en = now(), motivo_baja = 'Se perdió', baja_confirmado_con_google_en = now() WHERE id = $1`,
			[tablet()],
		);
		const antes = (await avisos()).length;
		await correr();
		expect(await avisos()).toHaveLength(antes);
	});
});
