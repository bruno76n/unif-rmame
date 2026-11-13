/**
 * Prueba de las cuentas de Ventas que comparten la pantalla y la API: el precio unitario, el total y el anticipo
 * aplicado a una nota.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Lo que la pantalla calcula mientras se escribe… sale del paquete
 * compartido y da lo mismo que la acción al guardar»)
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { anticipoAplicado, precioUnitario, totalDe } from "./ventas.ts";

describe("Lo que la pantalla de Ventas calcula mientras se escribe sale del paquete compartido", () => {
	it("el precio unitario es el dado o el sugerido más el recargo; el total, piezas por precio", () => {
		expect(precioUnitario(28_000, 2_000)).toBe(30_000);
		expect(
			totalDe([
				{ cantidad: 10, precioUnitarioCentavos: 30_000 },
				{ cantidad: 5, precioUnitarioCentavos: 28_000 },
			]),
		).toBe(440_000);
	});

	it("con datos al azar: el anticipo aplicado nunca pasa del disponible ni del subtotal, ni baja de cero", () => {
		fc.assert(
			fc.property(fc.integer({ min: -1_000_000, max: 10_000_000 }), fc.nat(10_000_000), (disponible, subtotal) => {
				const aplicado = anticipoAplicado(disponible, subtotal);
				expect(aplicado).toBeGreaterThanOrEqual(0);
				expect(aplicado).toBeLessThanOrEqual(Math.max(0, disponible));
				expect(aplicado).toBeLessThanOrEqual(subtotal);
			}),
			{ numRuns: 2000 },
		);
	});
});
