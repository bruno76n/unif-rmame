/**
 * Prueba de la base de las pruebas: una copia de la plantilla por archivo y una transacción deshecha por prueba.
 * Fase 2 · docs/fases/02-base-de-datos-y-pruebas.md (parte 4)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type BaseDePrueba, crearBaseDePrueba, enTransaccionDeshecha } from "./base/base-de-prueba.ts";

describe("cada archivo de pruebas tiene su propia base copia de la plantilla, y cada prueba deja la base como la encontró", () => {
	let una: BaseDePrueba;
	let otra: BaseDePrueba;

	beforeAll(async () => {
		[una, otra] = await Promise.all([crearBaseDePrueba(), crearBaseDePrueba()]);
		for (const base of [una, otra]) {
			await base.dueno.query("CREATE TABLE prueba_notas (id integer PRIMARY KEY, texto text NOT NULL)");
		}
	});
	afterAll(async () => {
		await Promise.all([una.borrar(), otra.borrar()]);
	});

	it("cada copia es una base distinta, con las migraciones de la plantilla", async () => {
		expect(una.nombre).not.toBe(otra.nombre);
		const secuencia = await una.app.query("SELECT 1 FROM pg_sequences WHERE sequencename = 'version_global'");
		expect(secuencia.rowCount).toBe(1);
	});

	it("lo que escribe una copia no se ve en la otra", async () => {
		await una.dueno.query("INSERT INTO prueba_notas VALUES (1, 'solo en una')");
		const enLaOtra = await otra.dueno.query("SELECT * FROM prueba_notas");
		expect(enLaOtra.rowCount).toBe(0);
	});

	it("una prueba dentro de su transacción deshecha deja la base como la encontró, aunque falle", async () => {
		const antes = await otra.dueno.query("SELECT count(*)::int AS n FROM prueba_notas");
		await enTransaccionDeshecha(otra.dueno, async (cliente) => {
			await cliente.query("INSERT INTO prueba_notas VALUES (7, 'de paso')");
			const dentro = await cliente.query("SELECT count(*)::int AS n FROM prueba_notas");
			expect(dentro.rows[0].n).toBe(antes.rows[0].n + 1);
		});
		await expect(
			enTransaccionDeshecha(otra.dueno, async (cliente) => {
				await cliente.query("INSERT INTO prueba_notas VALUES (8, 'falla')");
				throw new Error("la prueba falló");
			}),
		).rejects.toThrow("la prueba falló");
		const despues = await otra.dueno.query("SELECT count(*)::int AS n FROM prueba_notas");
		expect(despues.rows[0].n).toBe(antes.rows[0].n);
	});
});
