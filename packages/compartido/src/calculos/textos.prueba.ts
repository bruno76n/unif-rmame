/**
 * Prueba de las piezas de texto comunes: la cifra con su palabra en singular o en plural, con separador de miles.
 * Fase 19 · docs/interfaz/TEXTOS.md (las cifras y sus palabras)
 */

import { describe, expect, it } from "vitest";
import { plural } from "./textos.ts";

describe("Una cifra lleva su palabra en singular o en plural, con el separador de miles de México", () => {
	it("1 en singular; 0 y varios en plural; miles con coma", () => {
		expect(plural(1, "lote", "lotes")).toBe("1 lote");
		expect(plural(0, "lote", "lotes")).toBe("0 lotes");
		expect(plural(1250, "pieza", "piezas")).toBe("1,250 piezas");
	});
});
