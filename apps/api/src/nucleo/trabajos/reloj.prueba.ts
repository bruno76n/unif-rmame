/**
 * Prueba del reloj de los trabajos programados, con «ahora» controlado.
 * Fase 4 · docs/fases/04-servicios-comunes.md (parte 1)
 */

import { join } from "node:path";
import { type BaseDePrueba, crearBaseDePrueba } from "@uniformame/pruebas/base";
import { runOnce } from "graphile-worker";
import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { guardarEventosConAdmin } from "../acciones/corredor.ts";
import { crearBase } from "../base/conexion.ts";
import { cargarModulos, registrarModulos } from "../modulos.ts";
import { trabajoDePrueba } from "../pruebas/modulos/prueba/index.ts";
import { esquemaDelWorker } from "./esquema.ts";
import { correrReloj, vueltaQueToca } from "./reloj.ts";
import { contextoDeTrabajo, type DependenciasDelTrabajador, listaDeTareas } from "./trabajador.ts";

describe("un trabajo corre a la hora de México de su parámetro, una sola vez por periodo, y un cambio de horario vale desde la siguiente vuelta", () => {
	let prueba: BaseDePrueba;
	let dependencias: DependenciasDelTrabajador;
	const avisos: string[] = [];
	let ahora = Temporal.Instant.from("2026-11-10T07:59:00Z");
	beforeAll(async () => {
		prueba = await crearBaseDePrueba();
		const deLaApi = await cargarModulos(join(import.meta.dirname, "../../modulos"));
		const deLasPruebas = await cargarModulos(join(import.meta.dirname, "../pruebas/modulos"));
		dependencias = {
			base: crearBase(prueba.app),
			registro: registrarModulos([...deLaApi.modulos, ...deLasPruebas.modulos]),
			servicios: { guardarEventos: guardarEventosConAdmin, escribirBitacora: async () => undefined },
			avisarFalla: async (texto) => void avisos.push(texto),
			reloj: () => ahora,
		};
	});
	afterAll(async () => {
		await prueba.borrar();
	});
	beforeEach(() => {
		trabajoDePrueba.vueltas = [];
		trabajoDePrueba.fallar = false;
	});

	/** Una vuelta del reloj a la hora `ahora`. */
	async function vueltaDelReloj(): Promise<void> {
		await correrReloj(dependencias.registro.trabajos.values(), contextoDeTrabajo(dependencias, "reloj"));
	}

	/** Las tareas pendientes del trabajo de prueba en Graphile Worker, con su cola. */
	async function pendientes(): Promise<{ key: string; queue_name: string }[]> {
		const { rows } = await prueba.dueno.query(
			"SELECT key, queue_name FROM graphile_worker.jobs WHERE task_identifier = 'prueba.resumen' AND attempts < max_attempts",
		);
		return rows;
	}

	/** Corre lo que haya en la cola, como el worker. */
	async function correrLaCola(): Promise<void> {
		await runOnce({ pgPool: prueba.app, schema: esquemaDelWorker, taskList: listaDeTareas(dependencias) });
	}

	it("a la 01:59 de México no toca; a las 02:00 se encola una vez en su cola, corre, y no vuelve en el mismo día", async () => {
		trabajoDePrueba.horario = { cada: "dia", hora: "02:00" };
		ahora = Temporal.Instant.from("2026-11-10T07:59:00Z");
		await vueltaDelReloj();
		expect(await pendientes()).toEqual([]);
		ahora = Temporal.Instant.from("2026-11-10T08:00:00Z");
		await vueltaDelReloj();
		await vueltaDelReloj();
		expect(await pendientes()).toEqual([{ key: "prueba.resumen:2026-11-10", queue_name: "prueba.resumen" }]);
		await correrLaCola();
		expect(trabajoDePrueba.vueltas).toEqual(["2026-11-10"]);
		ahora = Temporal.Instant.from("2026-11-10T20:00:00Z");
		await vueltaDelReloj();
		await correrLaCola();
		expect(trabajoDePrueba.vueltas).toEqual(["2026-11-10"]);
	});

	it("un cambio de horario vale desde la siguiente vuelta, sin reiniciar nada", async () => {
		trabajoDePrueba.horario = { cada: "dia", hora: "02:00" };
		ahora = Temporal.Instant.from("2026-11-11T07:31:00Z");
		await vueltaDelReloj();
		expect(await pendientes()).toEqual([]);
		trabajoDePrueba.horario = { cada: "dia", hora: "01:30" };
		await vueltaDelReloj();
		await correrLaCola();
		expect(trabajoDePrueba.vueltas).toEqual(["2026-11-11"]);
	});

	it("si falla, avisa a soporte una vez y la siguiente vuelta del reloj lo vuelve a correr hasta que sale", async () => {
		trabajoDePrueba.horario = { cada: "dia", hora: "02:00" };
		trabajoDePrueba.fallar = true;
		ahora = Temporal.Instant.from("2026-11-12T08:00:00Z");
		const antes = avisos.length;
		await vueltaDelReloj();
		await correrLaCola();
		await vueltaDelReloj();
		await correrLaCola();
		expect(avisos.slice(antes)).toEqual(["El trabajo prueba.resumen falló (2026-11-12)"]);
		const { rows } = await prueba.dueno.query(
			"SELECT intentos, terminado_en FROM trabajos_vueltas WHERE trabajo = 'prueba.resumen' AND periodo = '2026-11-12'",
		);
		expect(rows[0]).toMatchObject({ intentos: 2, terminado_en: null });
		trabajoDePrueba.fallar = false;
		await vueltaDelReloj();
		await correrLaCola();
		expect(trabajoDePrueba.vueltas).toEqual(["2026-11-12"]);
	});

	it("el reloj deja listas las particiones de los meses que vienen y encola la bandeja si hay reintentos vencidos", async () => {
		await prueba.dueno.query(
			"INSERT INTO eventos (id, tipo, modulo, tablas, ocurrido_en) VALUES ('01936f2e-0000-7000-8000-0000000000e1', 'nota.creada', 'prueba', '{x}', now())",
		);
		await vueltaDelReloj();
		const { rows } = await prueba.dueno.query(
			"SELECT count(*)::int AS n FROM graphile_worker.jobs WHERE task_identifier = 'procesar_eventos'",
		);
		expect(rows[0]?.n).toBe(1);
		const particiones = await prueba.dueno.query(
			"SELECT count(*)::int AS n FROM pg_inherits WHERE inhparent = 'public.eventos'::regclass",
		);
		expect(particiones.rows[0]?.n).toBeGreaterThanOrEqual(4);
	});

	it("cada horario dice su periodo en hora de México: cada tantos minutos, por día, por semana (su lunes) y por mes", () => {
		const martes = Temporal.Instant.from("2026-11-10T20:47:00Z"); // 14:47 en México
		expect(vueltaQueToca({ cada: "minutos", minutos: 15 }, martes)).toBe("2026-11-10T14:45");
		expect(vueltaQueToca({ cada: "dia", hora: "14:47" }, martes)).toBe("2026-11-10");
		expect(vueltaQueToca({ cada: "dia", hora: "14:48" }, martes)).toBeUndefined();
		expect(vueltaQueToca({ cada: "semana", dia: 2, hora: "09:00" }, martes)).toBe("2026-11-09");
		expect(vueltaQueToca({ cada: "semana", dia: 7, hora: "03:00" }, martes)).toBeUndefined();
		expect(vueltaQueToca({ cada: "mes", dia: 1, hora: "00:10" }, martes)).toBe("2026-11");
		expect(vueltaQueToca({ cada: "mes", dia: 31, hora: "00:10" }, martes)).toBeUndefined();
		// El 31 de diciembre a las 11 de la noche en México todavía es 31.
		expect(vueltaQueToca({ cada: "dia", hora: "23:00" }, Temporal.Instant.from("2027-01-01T05:00:00Z"))).toBe(
			"2026-12-31",
		);
	});
});
