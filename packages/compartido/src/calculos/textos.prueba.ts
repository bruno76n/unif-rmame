/**
 * Prueba de las piezas de texto comunes: la cifra con su palabra en singular o en plural, con separador de miles, la
 * variación y el rango de tallas.
 * Fase 19 · docs/interfaz/TEXTOS.md (las cifras y sus palabras)
 */

import { describe, expect, it } from "vitest";
import { plural, rangoDeTallas, variacion } from "./textos.ts";

describe("Una cifra lleva su palabra en singular o en plural, con el separador de miles de México", () => {
	it("1 en singular; 0 y varios en plural; miles con coma", () => {
		expect(plural(1, "lote", "lotes")).toBe("1 lote");
		expect(plural(0, "lote", "lotes")).toBe("0 lotes");
		expect(plural(1250, "pieza", "piezas")).toBe("1,250 piezas");
	});
});

describe("Una variación se escribe con su flecha y su porcentaje redondeado", () => {
	it("sube o se queda igual con ▲, baja con ▼", () => {
		expect(variacion(151, 100)).toBe("▲ 51%");
		expect(variacion(100, 100)).toBe("▲ 0%");
		expect(variacion(92, 100)).toBe("▼ 8%");
	});

	it("sin nada antes no hay contra qué comparar", () => {
		expect(variacion(5, 0)).toBeNull();
	});
});

describe("El rango de tallas es uno solo para Catálogo, Patronaje y Ventas: de la primera a la última de cada grupo", () => {
	/** Tallas de un grupo. */
	const del = (grupo: string, ...tallas: string[]) => tallas.map((talla) => ({ grupo, talla }));

	it("un grupo dice su primera y su última; uno de una sola talla, la talla sola", () => {
		expect(rangoDeTallas(del("Números", "6", "8", "10", "12", "14"))).toBe("6 a 14");
		expect(rangoDeTallas(del("Únicas", "Unitalla"))).toBe("Unitalla");
		expect(rangoDeTallas([])).toBe("");
	});

	it("varios grupos van cada uno con su rango, el último con «y»", () => {
		expect(rangoDeTallas([...del("Números", "4", "16"), ...del("Letras", "CH", "M", "XG")])).toBe("4 a 16 y CH a XG");
		expect(rangoDeTallas([...del("Números", "4", "6"), ...del("Letras", "M"), ...del("Adulto", "S", "L")])).toBe(
			"4 a 6, M y S a L",
		);
	});
});
