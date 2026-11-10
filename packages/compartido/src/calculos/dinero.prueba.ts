/**
 * Pruebas del dinero en centavos.
 * Fase 1 · docs/cimientos/PAQUETE-COMPARTIDO.md («Dinero»)
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { centavos as c, esCentavos } from "../tipos/base.ts";
import { aPesoEntero, aplicarPorcentaje, centavosATexto, pesosACentavos, repartir } from "./dinero.ts";

/** Montos en centavos de cualquier tamaño que alcance un número entero seguro. */
const centavos = fc.maxSafeInteger().filter(esCentavos);
/** Montos del tamaño del negocio: hasta mil millones de pesos, positivos y negativos. */
const montos = fc.integer({ min: -100_000_000_000, max: 100_000_000_000 }).filter(esCentavos);

describe("el dinero nunca pierde ni sobra un centavo: repartir suma exactamente el total", () => {
	const pesos = fc.array(fc.integer({ min: 0, max: 10_000_000 }), { minLength: 1, maxLength: 40 });

	it("lo repartido suma exactamente el total, renglón por renglón", () => {
		fc.assert(
			fc.property(montos, pesos, (total, proporciones) => {
				fc.pre(proporciones.some((p) => p > 0));
				const partes = repartir(total, proporciones);
				expect(partes).toHaveLength(proporciones.length);
				expect(partes.reduce((suma, parte) => suma + parte, 0)).toBe(total);
			}),
			{ numRuns: 5000 },
		);
	});

	it("cada parte se aleja menos de un centavo de su proporción exacta, y un peso cero no recibe nada", () => {
		fc.assert(
			fc.property(montos, pesos, (total, proporciones) => {
				const suma = proporciones.reduce((a, b) => a + b, 0);
				fc.pre(suma > 0);
				repartir(total, proporciones).forEach((parte, i) => {
					const exacta = (BigInt(total) * BigInt(proporciones[i] ?? 0) * 1000n) / BigInt(suma);
					expect(Number(BigInt(parte) * 1000n - exacta)).toBeGreaterThan(-1000);
					expect(Number(BigInt(parte) * 1000n - exacta)).toBeLessThan(1000);
					if (proporciones[i] === 0) expect(parte).toBe(0);
				});
			}),
			{ numRuns: 3000 },
		);
	});

	it("casos fijos: el IVA de 100.00 entre tres renglones iguales", () => {
		expect(repartir(c(10_000), [1, 1, 1])).toEqual([3334, 3333, 3333]);
		expect(repartir(c(-10_000), [1, 1, 1])).toEqual([-3334, -3333, -3333]);
		expect(repartir(c(0), [0, 0])).toEqual([0, 0]);
	});

	it("rechaza pesos negativos, con decimales, o todos en cero con un total que repartir", () => {
		expect(() => repartir(c(100), [1, -1])).toThrow(RangeError);
		expect(() => repartir(c(100), [1.5])).toThrow(RangeError);
		expect(() => repartir(c(100), [0, 0])).toThrow(RangeError);
		expect(() => repartir(c(100), [])).toThrow(RangeError);
	});
});

describe("el dinero nunca pierde ni sobra un centavo: aPesoEntero siempre da múltiplos de 100", () => {
	it("siempre da un múltiplo de 100, a menos de medio peso del monto", () => {
		fc.assert(
			fc.property(montos, (monto) => {
				const redondo = aPesoEntero(monto);
				expect(redondo % 100 === 0).toBe(true);
				expect(Math.abs(redondo - monto)).toBeLessThanOrEqual(50);
			}),
			{ numRuns: 5000 },
		);
	});

	it("la mitad se redondea hacia arriba", () => {
		expect(aPesoEntero(c(12_350))).toBe(12_400);
		expect(aPesoEntero(c(12_349))).toBe(12_300);
		expect(aPesoEntero(c(-12_350))).toBe(-12_300);
		expect(aPesoEntero(c(-12_351))).toBe(-12_400);
	});
});

describe("el dinero nunca pierde ni sobra un centavo: pesosACentavos rechaza lo que no es dinero", () => {
	/** Escribe un monto como lo escribiría una persona: con o sin comas, con o sin centavos. */
	function comoTexto(monto: number, conComas: boolean, conCentavos: boolean): string {
		const signo = monto < 0 ? "-" : "";
		const absoluto = Math.abs(monto);
		const enteros = String(Math.trunc(absoluto / 100));
		const pesos = conComas ? enteros.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : enteros;
		return `${signo}${pesos}${conCentavos ? `.${String(absoluto % 100).padStart(2, "0")}` : ""}`;
	}

	it("lee de vuelta cualquier monto escrito con o sin comas", () => {
		fc.assert(
			fc.property(centavos, fc.boolean(), (monto, conComas) => {
				expect(pesosACentavos(comoTexto(monto, conComas, true))).toBe(monto);
			}),
			{ numRuns: 5000 },
		);
	});

	it("rechaza lo que no tiene forma de dinero", () => {
		const dinero = /^\s*-?\$?\s*(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?\s*$/;
		fc.assert(
			fc.property(fc.string(), (texto) => {
				fc.pre(!dinero.test(texto));
				expect(pesosACentavos(texto)).toBeNull();
			}),
			{ numRuns: 5000 },
		);
	});

	it("casos fijos de la captura", () => {
		expect(pesosACentavos("1,250")).toBe(125_000);
		expect(pesosACentavos("1250.50")).toBe(125_050);
		expect(pesosACentavos("1250.5")).toBe(125_050);
		expect(pesosACentavos("$1,250.05")).toBe(125_005);
		expect(pesosACentavos(" 0.07 ")).toBe(7);
		expect(pesosACentavos("-35")).toBe(-3500);
		for (const malo of [
			"",
			"abc",
			"1.234",
			"12,50",
			"1,25,000",
			"1..2",
			"1e3",
			"١٢٣",
			"--1",
			"1-",
			"99999999999999999999",
		]) {
			expect(pesosACentavos(malo), malo).toBeNull();
		}
	});
});

describe("aplicarPorcentaje saca un porcentaje y lo redondea al centavo; centavosATexto lo muestra en pesos de México", () => {
	it("queda a menos de medio centavo del porcentaje exacto", () => {
		const porcentajes = fc.integer({ min: 0, max: 999_999 }).map((milesimas) => (milesimas / 1000).toFixed(3));
		fc.assert(
			fc.property(montos, porcentajes, (monto, porcentaje) => {
				const resultado = aplicarPorcentaje(monto, porcentaje);
				const milesimas = BigInt(porcentaje.replace(".", ""));
				const exactoPorMil = BigInt(monto) * milesimas;
				const diferencia = BigInt(resultado) * 100_000n - exactoPorMil;
				expect(diferencia >= -50_000n && diferencia <= 50_000n).toBe(true);
			}),
			{ numRuns: 5000 },
		);
	});

	it("casos fijos", () => {
		expect(aplicarPorcentaje(c(25_000), "100")).toBe(25_000);
		expect(aplicarPorcentaje(c(25_000), 12.5)).toBe(3125);
		expect(aplicarPorcentaje(c(999), "16")).toBe(160);
		expect(aplicarPorcentaje(c(25_000), "0")).toBe(0);
		expect(() => aplicarPorcentaje(c(25_000), "12.3456")).toThrow(RangeError);
		expect(() => aplicarPorcentaje(c(25_000), "-5")).toThrow(RangeError);
	});

	it("muestra pesos sin decimales y, donde se aceptan centavos, con dos decimales", () => {
		expect(centavosATexto(c(125_000))).toBe("$1,250");
		expect(centavosATexto(c(125_050), { conCentavos: true })).toBe("$1,250.50");
		expect(centavosATexto(c(-5), { conCentavos: true })).toBe("-$0.05");
		expect(centavosATexto(c(0))).toBe("$0");
	});

	it("el texto con centavos se lee de vuelta al mismo monto", () => {
		fc.assert(
			fc.property(centavos, (monto) => {
				expect(pesosACentavos(centavosATexto(monto, { conCentavos: true }))).toBe(monto);
			}),
			{ numRuns: 3000 },
		);
	});
});
