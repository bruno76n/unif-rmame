/**
 * Prueba de la antigüedad de las cuentas por cobrar: los días vencida, su tramo con los cortes del parámetro y el saldo
 * de un cliente por tramo.
 * Fase 15 · docs/modulos/contaduria/cuentas-por-cobrar.md (regla 5)
 */

import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";
import { diasVencida, leerTramos, saldoPorTramo, tramoDe } from "./antiguedad.ts";

/** El día de hoy de la prueba. */
const hoy = Temporal.PlainDate.from("2026-11-24");

describe("La antigüedad: por vencer, 1 a 15, 16 a 30 y más de 30 días", () => {
	it("los días vencida y su tramo con «15,30»", () => {
		const cortes = leerTramos("15, 30");
		expect(cortes).toEqual([15, 30]);
		const casos: [string, number, number][] = [
			["2026-12-01", 0, 0],
			["2026-11-24", 0, 0],
			["2026-11-23", 1, 1],
			["2026-11-09", 15, 1],
			["2026-11-08", 16, 2],
			["2026-10-25", 30, 2],
			["2026-10-24", 31, 3],
		];
		for (const [vence, dias, tramo] of casos) {
			expect(diasVencida(vence, hoy)).toBe(dias);
			expect(tramoDe(dias, cortes)).toBe(tramo);
		}
	});

	it("el saldo por tramo de un cliente, con lo vencido y lo vencido de más de 30 días", () => {
		const cuentas = [
			{ saldoCentavos: 1_000, vence: "2026-12-01" },
			{ saldoCentavos: 2_000, vence: "2026-11-20" },
			{ saldoCentavos: 3_000, vence: "2026-11-01" },
			{ saldoCentavos: 4_000, vence: "2026-09-01" },
		];
		expect(saldoPorTramo(cuentas, hoy, [15, 30])).toEqual({
			tramos: [1_000, 2_000, 3_000, 4_000],
			total: 10_000,
			vencido: 9_000,
			vencidoDeMas: 4_000,
		});
	});

	it("unos tramos que no crecen no se leen", () => {
		for (const malo of ["30,15", "", "15,x", "0,30"]) expect(() => leerTramos(malo)).toThrow();
	});
});
