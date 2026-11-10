/**
 * Pruebas de los tipos base.
 * Fase 1 · docs/cimientos/PAQUETE-COMPARTIDO.md («Qué va aquí» y «Dinero»)
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { centavos, esCentavos, esUuid } from "./base.ts";

describe("los centavos son siempre enteros seguros", () => {
	it("acepta cualquier entero seguro y rechaza decimales, infinitos y enteros que no son seguros", () => {
		fc.assert(
			fc.property(fc.maxSafeInteger(), (n) => {
				expect(centavos(n)).toBe(n);
			}),
		);
		for (const malo of [0.5, -1.25, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
			expect(esCentavos(malo)).toBe(false);
			expect(() => centavos(malo)).toThrow(RangeError);
		}
	});
});

describe("un Uuid es un uuid v7", () => {
	it("acepta un uuid v7 y rechaza otras versiones, mayúsculas o cualquier texto", () => {
		expect(esUuid("01936f2e-8c3a-7b4d-9e5f-0123456789ab")).toBe(true);
		expect(esUuid("01936f2e-8c3a-4b4d-9e5f-0123456789ab")).toBe(false);
		expect(esUuid("01936F2E-8C3A-7B4D-9E5F-0123456789AB")).toBe(false);
		fc.assert(
			fc.property(fc.string(), (texto) => {
				expect(esUuid(texto)).toBe(false);
			}),
		);
	});
});
