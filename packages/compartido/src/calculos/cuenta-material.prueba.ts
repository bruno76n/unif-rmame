/**
 * Prueba de la cuenta de material: el ejemplo de la muestra y, con datos al azar, que siempre redondea hacia arriba
 * al entero, que la tela principal lleva su desperdicio y que una talla sin valor da «—».
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (parte 2)
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	aMilesimos,
	aMilesimosConSigno,
	cuentaDeMaterial,
	deMilesimos,
	type LineaDeLaCuenta,
} from "./cuenta-material.ts";

/** Una línea por talla de tela principal. */
function tela(porTalla: Record<string, string>, materialId = "gabardina"): LineaDeLaCuenta {
	return {
		materialId,
		esTelaPrincipal: true,
		cantidad: null,
		porTalla,
		recetaPorUnidadInventario: "1",
		seCuentaEntera: false,
	};
}

/** Un avío que va igual en todas las tallas. */
function avio(materialId: string, cantidad: string, conversion = "1", seCuentaEntera = false): LineaDeLaCuenta {
	return {
		materialId,
		esTelaPrincipal: false,
		cantidad,
		porTalla: {},
		recetaPorUnidadInventario: conversion,
		seCuentaEntera,
	};
}

/** Un decimal al azar con hasta tres decimales, como texto. */
const decimal = (maximoMilesimos: number) =>
	fc
		.integer({ min: 0, max: maximoMilesimos })
		.map((milesimos) => `${Math.trunc(milesimos / 1000)}.${String(milesimos % 1000).padStart(3, "0")}`);

describe("La cuenta de material da lo mismo en la pantalla y en la API: la tela principal con desperdicio, todo hacia arriba, un cono por lo menos, y «—» si falta un dato", () => {
	it("el corte de la muestra: 190 piezas llevan 214 m de gabardina, 190 cierres, 190 botones y 1 cono de hilo", () => {
		const piezas = { "10": 40, "12": 50, "14": 50, "16": 50 };
		const cuenta = cuentaDeMaterial(
			[
				tela({ "10": "1.000", "12": "1.050", "14": "1.080", "16": "1.100" }),
				avio("cierre", "1"),
				avio("boton", "1"),
				// El hilo se captura en metros y se guarda en conos de 5,000 m.
				avio("hilo", "4.5", "5000", true),
			],
			piezas,
			"6",
		);
		// (40 × 1 + 50 × 1.05 + 50 × 1.08 + 50 × 1.10) × 1.06 = 213.21 → 214.
		expect(cuenta).toEqual({ gabardina: 214, cierre: 190, boton: 190, hilo: 1 });
	});

	it("la combinación y los avíos no llevan desperdicio; la cuenta en centímetros se divide entre 100", () => {
		const combinacion = { ...tela({ "10": "0.300" }, "combinacion"), esTelaPrincipal: false };
		expect(cuentaDeMaterial([combinacion, avio("listón", "35", "100")], { "10": 10 }, "6")).toEqual({
			combinacion: 3,
			listón: 4,
		});
	});

	it("una talla con piezas sin su valor da «—»; una talla sin piezas no lo pide", () => {
		expect(cuentaDeMaterial([tela({ "10": "1.000" })], { "10": 5, "12": 3 }, "6")).toEqual({ gabardina: null });
		expect(cuentaDeMaterial([tela({ "10": "1.000" })], { "10": 5, "12": 0 }, "6")).toEqual({ gabardina: 6 });
	});

	it("un material que se cuenta entero lleva al menos uno; sin piezas, nada", () => {
		expect(cuentaDeMaterial([avio("hilo", "0.001", "5000", true)], { "10": 1 }, "0")).toEqual({ hilo: 1 });
		expect(cuentaDeMaterial([avio("hilo", "4.5", "5000", true)], { "10": 0 }, "0")).toEqual({ hilo: 0 });
	});

	it("con datos al azar: es el entero de arriba de la cuenta exacta, y más desperdicio nunca da menos", () => {
		fc.assert(
			fc.property(
				fc.dictionary(fc.constantFrom("10", "12", "14", "16", "CH", "M"), decimal(5_000), { minKeys: 1 }),
				fc.dictionary(fc.constantFrom("10", "12", "14", "16", "CH", "M"), fc.integer({ min: 0, max: 500 })),
				decimal(30_000),
				decimal(99_999).filter((texto) => aMilesimos(texto) > 0n),
				fc.integer({ min: 0, max: 20_000 }),
				(porTalla, piezas, desperdicio, conversion, extra) => {
					const linea = { ...tela(porTalla), recetaPorUnidadInventario: conversion };
					const cuenta = cuentaDeMaterial([linea], piezas, desperdicio).gabardina;
					const faltaUna = Object.entries(piezas).some(([talla, suyas]) => suyas > 0 && porTalla[talla] === undefined);
					if (faltaUna) {
						expect(cuenta).toBeNull();
						return;
					}
					// La cuenta exacta, como fracción: Σ piezas × milésimos × (100 000 + desperdicio) ÷ (100 000 × conversión).
					const numerador =
						Object.entries(piezas).reduce(
							(suma, [talla, suyas]) => suma + BigInt(suyas) * aMilesimos(porTalla[talla] ?? "0"),
							0n,
						) *
						(100_000n + aMilesimos(desperdicio));
					const denominador = 100_000n * aMilesimos(conversion);
					const entero = BigInt(cuenta ?? -1);
					expect(entero * denominador >= numerador).toBe(true);
					expect((entero - 1n) * denominador < numerador || entero === 0n).toBe(true);
					const masDesperdicio = `${Number(desperdicio) + extra / 1000}`;
					const conMas = cuentaDeMaterial([linea], piezas, Number(masDesperdicio).toFixed(3)).gabardina ?? 0;
					expect(conMas).toBeGreaterThanOrEqual(cuenta ?? 0);
				},
			),
			{ numRuns: 2_000 },
		);
	});
});

describe("los milésimos con signo van y vuelven como los guarda la base", () => {
	it("cualquier entero de milésimos regresa igual", () => {
		fc.assert(
			fc.property(fc.bigInt({ min: -1_000_000_000_000n, max: 1_000_000_000_000n }), (milesimos) => {
				expect(aMilesimosConSigno(deMilesimos(milesimos))).toBe(milesimos);
			}),
		);
		expect(deMilesimos(-5_250n)).toBe("-5.250");
		expect(deMilesimos(1_700_000n)).toBe("1700.000");
	});
});
