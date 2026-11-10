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
		const base = esquemaDe([tabla()], "tablet_taller");
		expect(esquemaDe([tabla({ columnas: ["ubicacion_id", "nombre"] })], "tablet_taller")).toBe(base);
		const distintas = [
			esquemaDe([tabla({ columnas: ["nombre"] })], "tablet_taller"),
			esquemaDe([tabla({ orden: 11 })], "tablet_taller"),
			esquemaDe([tabla({ filtro: (aparato) => sql`t.ubicacion_id = ${aparato.ubicacionId}::uuid` })], "tablet_taller"),
			esquemaDe([tabla({ parametros: ["prueba.atendidos_bajan"] })], "tablet_taller"),
		];
		for (const otra of distintas) expect(otra).not.toBe(base);
		expect(Number.isInteger(base) && base >= 0 && base < 2 ** 28).toBe(true);
	});

	it("también cuando el filtro escoge en el código según la ubicación o el tipo del aparato", () => {
		const segun = (conUbicacion: string) =>
			tabla({
				filtro: (aparato) => (aparato.ubicacionId === null ? sql`false` : sql.raw(conUbicacion)),
			});
		expect(esquemaDe([segun("t.cerrado")], "tablet_taller")).not.toBe(
			esquemaDe([segun("NOT t.cerrado")], "tablet_taller"),
		);
		const segunElTipo = tabla({ filtro: (aparato) => (aparato.tipo === "tablet_taller" ? sql`true` : sql`false`) });
		expect(esquemaDe([segunElTipo], "tablet_taller")).not.toBe(esquemaDe([segunElTipo], "computadora_tienda"));
		// La misma lista se calcula una vez: la segunda vez regresa lo mismo.
		const lista = [tabla()];
		expect(esquemaDe(lista, "tablet_taller")).toBe(esquemaDe(lista, "tablet_taller"));
	});
});
