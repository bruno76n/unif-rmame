/**
 * Prueba del tope del bulto: nunca es negativo, la primera operación después del corte topa en las piezas del bulto,
 * y registrar justo el tope lo deja en cero sin pasarse; lo mismo en la tablet que en la API.
 * Fase 12 · docs/fases/12-produccion.md (parte 4)
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { pasaDelTope, topeDelBulto } from "./tope-bulto.ts";

describe("El tope del bulto: lo que hizo la anterior menos lo que ya registró esta, nunca negativo", () => {
	it("el ejemplo de Ana: 24 piezas en el bulto, Costados después del corte", () => {
		const bulto = { piezasDelBulto: 24, buenasDeLaAnterior: null, hechasEnEsta: 0 };
		expect(topeDelBulto(bulto)).toBe(24);
		expect(pasaDelTope(bulto, 24)).toBe(false);
		expect(topeDelBulto({ ...bulto, hechasEnEsta: 24 })).toBe(0);
		// La siguiente operación topa en lo bueno de Costados.
		expect(topeDelBulto({ piezasDelBulto: 24, buenasDeLaAnterior: 22, hechasEnEsta: 5 })).toBe(17);
		expect(pasaDelTope({ piezasDelBulto: 24, buenasDeLaAnterior: 22, hechasEnEsta: 5 }, 18)).toBe(true);
	});

	it("con datos al azar: nunca negativo, y registrar el tope deja el siguiente en cero", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 48 }),
				fc.option(fc.integer({ min: 0, max: 48 }), { nil: null }),
				fc.integer({ min: 0, max: 60 }),
				(piezasDelBulto, buenasDeLaAnterior, hechasEnEsta) => {
					const datos = { piezasDelBulto, buenasDeLaAnterior, hechasEnEsta };
					const tope = topeDelBulto(datos);
					return (
						tope >= 0 &&
						!pasaDelTope(datos, tope) &&
						topeDelBulto({ ...datos, hechasEnEsta: hechasEnEsta + tope }) === 0
					);
				},
			),
			{ numRuns: 3000 },
		);
	});
});
