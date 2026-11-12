/**
 * Prueba de la antigüedad, el saldo por pagar y el flujo de los próximos días: una detenida cuenta en el saldo, pero
 * no en lo vencido ni en el flujo.
 * Fase 17 · docs/fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md (criterio «una detenida no se paga ni sale
 * en lo vencido ni en el flujo»)
 */

import fc from "fast-check";
import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";
import { estadosDeCuentaPorPagar } from "../tablas.ts";
import { antiguedadPorPagar, type CuentaParaPagar, flujoDeLosProximosDias, saldoPorPagar } from "./saldo-por-pagar.ts";

const hoy = Temporal.PlainDate.from("2026-11-12");

describe("La antigüedad, el saldo por pagar y el flujo de los próximos días", () => {
	it("una detenida no sale en lo vencido ni en el flujo, pero sí en el saldo por pagar", () => {
		const cuentas: CuentaParaPagar[] = [
			{ estado: "por_pagar", vence: "2026-11-10", saldoCentavos: 1_000 },
			{ estado: "detenida", vence: "2026-11-10", saldoCentavos: 5_000 },
			{ estado: "pagada_en_parte", vence: "2026-11-12", saldoCentavos: 200 },
			{ estado: "detenida", vence: "2026-11-13", saldoCentavos: 7_000 },
			{ estado: "por_pagar", vence: "2026-11-20", saldoCentavos: 300 },
			{ estado: "pagada", vence: "2026-11-12", saldoCentavos: 0 },
			{ estado: "cancelada", vence: "2026-11-12", saldoCentavos: 9_000 },
		];
		expect(saldoPorPagar(cuentas)).toBe(1_000 + 5_000 + 200 + 7_000 + 300);
		expect(antiguedadPorPagar(cuentas, hoy, 7)).toEqual({
			vencido: 1_000,
			estaSemana: 200,
			semanas: [300, 0, 0, 0],
			despues: 0,
		});
		const flujo = flujoDeLosProximosDias(
			[
				{ vence: "2026-11-12", saldoCentavos: 900 },
				{ vence: "2026-11-11", saldoCentavos: 4_000 },
			],
			cuentas,
			hoy,
			7,
		);
		expect(flujo).toHaveLength(7);
		expect(flujo[0]).toEqual({ dia: "2026-11-12", porCobrar: 900, porPagar: 200, neto: 700 });
		expect(flujo[1]).toEqual({ dia: "2026-11-13", porCobrar: 0, porPagar: 0, neto: 0 });
	});

	it("con cuentas al azar, la antigüedad reparte todo lo que se debe sin detenidas, y el saldo suma también las detenidas", () => {
		const cuenta = fc.record({
			estado: fc.constantFrom(...estadosDeCuentaPorPagar),
			vence: fc.integer({ min: -60, max: 60 }).map((dias) => hoy.add({ days: dias }).toString()),
			saldoCentavos: fc.integer({ min: 0, max: 1_000_000 }),
		});
		fc.assert(
			fc.property(fc.array(cuenta), fc.integer({ min: 1, max: 14 }), (cuentas, ventana) => {
				const debidas = cuentas.filter((una) => una.estado !== "pagada" && una.estado !== "cancelada");
				const enCalendario = debidas.filter((una) => una.estado !== "detenida");
				const antiguedad = antiguedadPorPagar(cuentas, hoy, ventana);
				const repartido =
					antiguedad.vencido +
					antiguedad.estaSemana +
					antiguedad.semanas.reduce((suma, una) => suma + una, 0) +
					antiguedad.despues;
				expect(repartido).toBe(enCalendario.reduce((suma, una) => suma + una.saldoCentavos, 0));
				expect(saldoPorPagar(cuentas)).toBe(debidas.reduce((suma, una) => suma + una.saldoCentavos, 0));
			}),
		);
	});
});
