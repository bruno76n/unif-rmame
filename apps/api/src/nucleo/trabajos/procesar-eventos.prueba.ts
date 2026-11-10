/**
 * Prueba del proceso de la bandeja de eventos.
 * Fase 4 · docs/fases/04-servicios-comunes.md (parte 1)
 */

import { type BaseDePrueba, crearBaseDePrueba } from "@uniformame/pruebas/base";
import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type Base, crearBase } from "../base/conexion.ts";
import { type DependenciasDelProceso, procesarEventos } from "./procesar-eventos.ts";

describe("con dos workers, cada evento se procesa una vez; uno que falla se reintenta a 1, 5, 30 y 120 minutos y a los 10 intentos avisa a soporte", () => {
	let prueba: BaseDePrueba;
	let base: Base;
	beforeAll(async () => {
		prueba = await crearBaseDePrueba();
		base = crearBase(prueba.app);
	});
	afterAll(async () => {
		await prueba.borrar();
	});
	beforeEach(async () => {
		await prueba.dueno.query("TRUNCATE eventos");
	});

	/** Anota `n` eventos como lo haría `admin.guardar_evento`, y regresa sus ids. */
	async function anotar(n: number): Promise<string[]> {
		const ids = Array.from({ length: n }, () => uuidv7());
		await prueba.app.query(
			`INSERT INTO eventos (id, tipo, modulo, datos, tablas, ocurrido_en)
			 SELECT id, 'nota.creada', 'prueba', '{}', '{prueba_notas}', now() FROM unnest($1::uuid[]) AS id`,
			[ids],
		);
		return ids;
	}

	/** Las dependencias del proceso, con un reparto y un aviso de prueba. */
	function dependencias(
		repartir: DependenciasDelProceso["repartir"],
		avisos: string[] = [],
		ahora = () => Temporal.Now.instant(),
	): DependenciasDelProceso {
		return {
			base,
			repartir,
			ahora,
			avisarFalla: async (trabajo, error) => void avisos.push(`${trabajo} falló: ${error}`),
		};
	}

	it("dos workers a la vez sobre 250 eventos: cada uno se reparte una sola vez y todos quedan procesados", async () => {
		const ids = await anotar(250);
		const repartidos: string[] = [];
		const repartir: DependenciasDelProceso["repartir"] = async (_transaccion, evento) => {
			repartidos.push(evento.id);
			// Un poco de espera para que los dos workers trabajen al mismo tiempo.
			await new Promise((listo) => setTimeout(listo, 1));
		};
		const [uno, dos] = await Promise.all([
			procesarEventos(dependencias(repartir)),
			procesarEventos(dependencias(repartir)),
		]);
		expect(uno + dos).toBe(250);
		expect(uno).toBeGreaterThan(0);
		expect(dos).toBeGreaterThan(0);
		expect([...repartidos].sort()).toEqual([...ids].sort());
		const { rows } = await prueba.dueno.query("SELECT count(*)::int AS n FROM eventos WHERE procesado_en IS NULL");
		expect(rows[0]?.n).toBe(0);
	});

	it("uno que falla espera 1, 5, 30 y 120 minutos, y luego cada 120; al décimo intento avisa a soporte, una vez", async () => {
		const [id] = await anotar(1);
		const avisos: string[] = [];
		let ahora = Temporal.Instant.from("2026-11-10T16:00:00Z");
		const fallar: DependenciasDelProceso["repartir"] = async () => {
			throw new Error("falla de prueba al repartir");
		};
		const esperas: number[] = [];
		for (let intento = 1; intento <= 11; intento++) {
			expect(await procesarEventos(dependencias(fallar, avisos, () => ahora))).toBe(1);
			const { rows } = await prueba.dueno.query(
				"SELECT intentos, siguiente_intento_en, ultimo_error FROM eventos WHERE id = $1",
				[id],
			);
			const siguiente = Temporal.Instant.from(new Date(rows[0]?.siguiente_intento_en).toISOString());
			expect(rows[0]).toMatchObject({ intentos: intento, ultimo_error: "falla de prueba al repartir" });
			esperas.push(ahora.until(siguiente).total("minutes"));
			// Antes de su hora no se toma otra vez.
			expect(await procesarEventos(dependencias(fallar, avisos, () => siguiente.subtract({ seconds: 1 })))).toBe(0);
			ahora = siguiente;
		}
		expect(esperas).toEqual([1, 5, 30, 120, 120, 120, 120, 120, 120, 120, 120]);
		expect(avisos).toHaveLength(1);
		expect(avisos[0]).toContain(`El evento nota.creada (${id}) falló: 10 intentos`);
	});

	it("si uno falla, los demás de la misma vuelta sí quedan procesados", async () => {
		const [malo, ...buenos] = await anotar(3);
		await procesarEventos(
			dependencias(async (_transaccion, evento) => {
				if (evento.id === malo) throw new Error("solo este");
			}),
		);
		const { rows } = await prueba.dueno.query("SELECT id FROM eventos WHERE procesado_en IS NOT NULL ORDER BY id");
		expect(rows.map((renglon) => renglon.id)).toEqual([...buenos].sort());
	});
});
