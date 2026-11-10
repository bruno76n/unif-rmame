/**
 * Prueba de que cada tabla de negocio lleva su disparador de las columnas comunes.
 * Fase 6 · docs/cimientos/BASE-DE-DATOS.md («Columnas comunes») y docs/cimientos/SINCRONIZACION.md (el tope)
 *
 * Una tabla con `version` sin su disparador dejaría que el código la pusiera a mano; una con `xid_escritura`
 * sin `baja_a_aparatos` no tomaría el número de su transacción, y la bajada se saltaría sus cambios.
 */

import { type BaseDePrueba, crearBaseDePrueba } from "@uniformame/pruebas/base";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("toda tabla con version lleva el disparador columnas_comunes, y toda tabla con xid_escritura lo lleva con baja_a_aparatos", () => {
	let prueba: BaseDePrueba;
	beforeAll(async () => {
		prueba = await crearBaseDePrueba();
	});
	afterAll(async () => {
		await prueba.borrar();
	});

	it("ninguna tabla de las migraciones se queda sin su disparador", async () => {
		const { rows } = await prueba.dueno.query(`
			SELECT c.relname AS tabla,
			       bool_or(a.attname = 'xid_escritura') AS baja,
			       (SELECT encode(t.tgargs, 'escape') FROM pg_trigger t
			         WHERE t.tgrelid = c.oid AND t.tgname = 'columnas_comunes') AS argumento
			FROM pg_class c
			JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
			WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND NOT c.relispartition
			GROUP BY c.oid, c.relname
			HAVING bool_or(a.attname = 'version')
			ORDER BY c.relname`);
		expect(rows.length).toBeGreaterThan(10);
		const sinDisparador = rows.filter((fila) => fila.argumento === null).map((fila) => fila.tabla);
		const bajaSinXid = rows
			.filter((fila) => fila.baja && !String(fila.argumento).startsWith("baja_a_aparatos"))
			.map((fila) => fila.tabla);
		expect({ sinDisparador, bajaSinXid }).toEqual({ sinDisparador: [], bajaSinXid: [] });
	});
});
