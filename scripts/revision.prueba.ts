/**
 * Prueba de los pasos de la revisión completa.
 * Fase 1 · docs/cimientos/ESTRUCTURA.md («Comandos», `pnpm revision`)
 */

import { describe, expect, it } from "vitest";
import { raizReal } from "./repositorio-de-prueba.ts";
import { pasosDeLaRevision } from "./revision.ts";

describe("la revisión completa corre los pasos que ya existen, en el orden de ESTRUCTURA.md", () => {
	it("Biome, tipos, todas las pruebas, secretos, dependencias y archivos de creación", () => {
		// Las migraciones desde cero entran en la fase 2 y openapi.json en la fase 3 («Excepciones permitidas» de la fase 1).
		expect(pasosDeLaRevision(raizReal).map((paso) => paso.nombre)).toEqual([
			"Estilo (Biome)",
			"Tipos (tsc)",
			"Todas las pruebas (Vitest)",
			"Secretos",
			"Dependencias (pnpm audit)",
			"Archivos de creación (docs:revisar)",
		]);
	});
});
