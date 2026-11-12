/**
 * Prueba del semáforo sugerido: lo vencido, el uso del límite y, sin crédito, solo lo vencido.
 * Fase 15 · docs/fases/15-contaduria-terceros-credito-y-cobranza.md («Criterios de terminado»)
 */

import fc from "fast-check";
import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";
import { type DatosDelSemaforo, semaforoSugerido } from "./semaforo-sugerido.ts";

/** El día de hoy de la prueba. */
const hoy = Temporal.PlainDate.from("2026-11-24");

/** Una fecha a tantos días de hoy (negativo: ya pasó). */
const aDias = (dias: number) => hoy.add({ days: dias }).toString();

/** Los datos del ejemplo del archivo: Zamora con límite de $80,000 y los parámetros iniciales. */
const zamora = (cuentas: DatosDelSemaforo["cuentas"], limiteCentavos = 8_000_000): DatosDelSemaforo => ({
	limiteCentavos,
	cuentas,
	hoy,
	diasVencidoDetenido: 30,
	porcentajeCercaLimite: 80,
});

/** Unos datos al azar: el límite en pesos enteros (o sin crédito) y hasta seis cuentas que vencen de −60 a 30 días. */
const datosAlAzar = fc.record({
	limiteCentavos: fc.oneof(
		fc.constant(0),
		fc.integer({ min: 1, max: 200_000 }).map((pesos) => pesos * 100),
	),
	cuentas: fc.array(
		fc.record({
			saldoCentavos: fc.integer({ min: 0, max: 10_000_000 }),
			vence: fc.integer({ min: -60, max: 30 }).map(aDias),
		}),
		{ maxLength: 6 },
	),
	diasVencidoDetenido: fc.integer({ min: 1, max: 60 }),
	porcentajeCercaLimite: fc.integer({ min: 1, max: 100 }),
});

describe("El semáforo sugerido sigue sus reglas: lo vencido, el uso del límite y, sin crédito, solo lo vencido", () => {
	it("el ejemplo: $68,000 de $80,000 es 85 % y sugiere «Cerca del límite»; vencido hace 31 días, «Detenido»", () => {
		expect(semaforoSugerido(zamora([{ saldoCentavos: 6_800_000, vence: aDias(5) }]))).toEqual({
			sugerido: "cerca_del_limite",
			saldoCentavos: 6_800_000,
			usoPorcentaje: 85,
			cercaDelLimite: true,
			pasaElLimite: false,
			diasVencido: 0,
		});
		expect(semaforoSugerido(zamora([{ saldoCentavos: 100_000, vence: aDias(-31) }])).sugerido).toBe("detenido");
		expect(semaforoSugerido(zamora([{ saldoCentavos: 100_000, vence: aDias(-30) }])).sugerido).toBe("cerca_del_limite");
		expect(semaforoSugerido(zamora([{ saldoCentavos: 100_000, vence: aDias(0) }])).sugerido).toBe("al_corriente");
		// Justo en el 80 % no está cerca; un centavo más, sí. Arriba del límite, «Detenido».
		expect(semaforoSugerido(zamora([{ saldoCentavos: 6_400_000, vence: aDias(1) }])).sugerido).toBe("al_corriente");
		expect(semaforoSugerido(zamora([{ saldoCentavos: 6_400_001, vence: aDias(1) }])).sugerido).toBe("cerca_del_limite");
		expect(semaforoSugerido(zamora([{ saldoCentavos: 8_000_001, vence: aDias(1) }]))).toMatchObject({
			sugerido: "detenido",
			pasaElLimite: true,
		});
		// Una cuenta vencida ya pagada no cuenta.
		expect(semaforoSugerido(zamora([{ saldoCentavos: 0, vence: aDias(-90) }])).sugerido).toBe("al_corriente");
	});

	it("sin crédito no cuenta el límite: con saldo y nada vencido queda al corriente", () => {
		expect(semaforoSugerido(zamora([{ saldoCentavos: 9_000_000, vence: aDias(10) }], 0))).toEqual({
			sugerido: "al_corriente",
			saldoCentavos: 9_000_000,
			usoPorcentaje: null,
			cercaDelLimite: false,
			pasaElLimite: false,
			diasVencido: 0,
		});
	});

	it("con datos al azar, el semáforo es el que dicen las reglas 4 y 5", () => {
		fc.assert(
			fc.property(datosAlAzar, (azar) => {
				const datos = { ...azar, hoy };
				const calculado = semaforoSugerido(datos);
				const conSaldo = datos.cuentas.filter((cuenta) => cuenta.saldoCentavos > 0);
				const saldo = conSaldo.reduce((suma, cuenta) => suma + cuenta.saldoCentavos, 0);
				const vencidos = conSaldo.map((cuenta) => hoy.since(Temporal.PlainDate.from(cuenta.vence)).days);
				const masViejo = Math.max(0, ...vencidos);
				expect(calculado.saldoCentavos).toBe(saldo);
				expect(calculado.diasVencido).toBe(masViejo);
				const limite = datos.limiteCentavos;
				// Sin crédito, el límite no aplica (regla 4).
				if (limite === 0) {
					expect([calculado.usoPorcentaje, calculado.cercaDelLimite, calculado.pasaElLimite]).toEqual([
						null,
						false,
						false,
					]);
				} else {
					expect(calculado.pasaElLimite).toBe(saldo > limite);
					// Más del porcentaje del límite, comparado en enteros: saldo × 100 > porcentaje × límite.
					expect(calculado.cercaDelLimite).toBe(saldo * 100 > datos.porcentajeCercaLimite * limite);
					expect(calculado.usoPorcentaje).toBe(Math.floor((saldo * 100) / limite));
				}
				const esperado =
					masViejo > datos.diasVencidoDetenido || calculado.pasaElLimite
						? "detenido"
						: masViejo > 0 || calculado.cercaDelLimite
							? "cerca_del_limite"
							: "al_corriente";
				expect(calculado.sugerido).toBe(esperado);
			}),
			{ numRuns: 3000 },
		);
	});
});
