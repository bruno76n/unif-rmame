/**
 * Prueba de la versión del esquema de sincronización: cambia sola con lo que baja, también con solo el filtro.
 * Fase 6 · docs/fases/06-dispositivos-y-sincronizacion.md («un cursor … de otro esquema pide la foto»)
 */

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { TablaQueBaja } from "../modulos.ts";
import { esquemaDe } from "./cursor.ts";

/** Una tabla que baja, con lo que se le cambie. */
function tabla(cambio: Partial<TablaQueBaja> = {}): TablaQueBaja {
	return {
		tabla: "prueba_lotes",
		aparatos: ["tablet_taller"],
		orden: 10,
		columnas: ["nombre", "ubicacion_id"],
		filtro: (aparato) => sql`t.ubicacion_id = ${aparato.ubicacionId}::uuid AND NOT t.cerrado`,
		...cambio,
	};
}

describe("la versión del esquema cambia cuando cambia lo que baja, y solo entonces", () => {
	it("igual con lo mismo (sin importar el orden de las columnas); distinta con otras columnas, otro orden, otro filtro u otros parámetros", () => {
		const base = esquemaDe([tabla()]);
		expect(esquemaDe([tabla({ columnas: ["ubicacion_id", "nombre"] })])).toBe(base);
		const distintas = [
			esquemaDe([tabla({ columnas: ["nombre"] })]),
			esquemaDe([tabla({ orden: 11 })]),
			esquemaDe([tabla({ filtro: (aparato) => sql`t.ubicacion_id = ${aparato.ubicacionId}::uuid` })]),
			esquemaDe([tabla({ parametros: ["prueba.atendidos_bajan"] })]),
		];
		for (const otra of distintas) expect(otra).not.toBe(base);
		expect(Number.isInteger(base) && base >= 0 && base < 2 ** 28).toBe(true);
	});
});
