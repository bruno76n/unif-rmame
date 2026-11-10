/**
 * Prueba del disparador de las columnas comunes, con una tabla de prueba hecha con los ayudantes de columnas.
 * Fase 2 · docs/fases/02-base-de-datos-y-pruebas.md (parte 2)
 */

import { type BaseDePrueba, crearBaseDePrueba } from "@uniformame/pruebas/base";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { eq, sql } from "drizzle-orm";
import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	columnasComunes,
	columnasDeAparato,
	columnasDeBaja,
	columnasDeCancelacion,
	columnaXidEscritura,
} from "./columnas.ts";
import { type Base, crearBase } from "./conexion.ts";

/** Una tabla de prueba que baja a los aparatos. */
const documentos = pgTable("prueba_documentos", {
	id: uuid("id").primaryKey(),
	nombre: text("nombre").notNull(),
	...columnasComunes(),
	...columnaXidEscritura(),
	...columnasDeAparato(),
	...columnasDeCancelacion(),
});

/** Una tabla de prueba que no baja. */
const catalogo = pgTable("prueba_catalogo", {
	id: uuid("id").primaryKey(),
	nombre: text("nombre").notNull(),
	...columnasComunes(),
	...columnasDeBaja(),
});

describe("toda escritura pone version desde la secuencia global y actualizado_en; en una tabla que baja, también xid_escritura; el código no puede ponerlos a mano", () => {
	let prueba: BaseDePrueba;
	let base: Base;

	beforeAll(async () => {
		prueba = await crearBaseDePrueba();
		// Las tablas se crean con el SQL que generaría drizzle-kit, y el disparador como lo pone una migración.
		const sentencias = await generateMigration(generateDrizzleJson({}), generateDrizzleJson({ documentos, catalogo }));
		for (const sentencia of sentencias) await prueba.dueno.query(sentencia);
		await prueba.dueno.query("SELECT poner_disparador_comun('prueba_documentos', baja_a_aparatos => true)");
		await prueba.dueno.query("SELECT poner_disparador_comun('prueba_catalogo')");
		base = crearBase(prueba.app);
	});
	afterAll(async () => {
		await prueba.borrar();
	});

	it("al insertar pone version de la secuencia, actualizado_en y xid_escritura de la transacción, aunque el código mande otros", async () => {
		const id = "01936f2e-8c3a-7b4d-9e5f-000000000001";
		const resultado = await base.transaction(async (transaccion) => {
			await transaccion.insert(documentos).values({
				id,
				nombre: "PE-0145",
				version: 999_999,
				xidEscritura: "1",
				actualizadoEn: "2000-01-01T00:00:00Z",
			});
			const transaccionActual = await transaccion.execute(sql`SELECT pg_current_xact_id()::text AS xid`);
			const [renglon] = await transaccion.select().from(documentos).where(eq(documentos.id, id));
			return { renglon, xid: transaccionActual.rows[0]?.xid };
		});
		expect(resultado.renglon?.version).not.toBe(999_999);
		expect(resultado.renglon?.version).toBeGreaterThan(0);
		expect(resultado.renglon?.xidEscritura).toBe(resultado.xid);
		expect(new Date(resultado.renglon?.actualizadoEn ?? 0).getFullYear()).toBeGreaterThan(2000);
	});

	it("al cambiar sube version, cambia actualizado_en y xid_escritura, y no deja ponerlos a mano", async () => {
		const id = "01936f2e-8c3a-7b4d-9e5f-000000000002";
		await base.insert(documentos).values({ id, nombre: "L-2026-122" });
		const [antes] = await base.select().from(documentos).where(eq(documentos.id, id));
		await base
			.update(documentos)
			.set({ nombre: "L-2026-122 (corte)", version: 1, xidEscritura: "1" })
			.where(eq(documentos.id, id));
		const [despues] = await base.select().from(documentos).where(eq(documentos.id, id));
		expect(despues?.version).toBeGreaterThan(antes?.version ?? Number.POSITIVE_INFINITY);
		expect(despues?.xidEscritura).not.toBe("1");
		expect(despues?.xidEscritura).not.toBe(antes?.xidEscritura);
		expect(new Date(despues?.actualizadoEn ?? 0).getTime()).toBeGreaterThan(
			new Date(antes?.actualizadoEn ?? 0).getTime(),
		);
	});

	it("la app no puede tomar otra secuencia: una secuencia temporal con el mismo nombre no cambia la version", async () => {
		const cliente = await prueba.app.connect();
		try {
			const creada = await cliente.query("CREATE TEMP SEQUENCE version_global START 424242").then(
				() => true,
				() => false,
			);
			await cliente.query(
				"INSERT INTO prueba_documentos (id, nombre) VALUES ('01936f2e-8c3a-7b4d-9e5f-000000000009', 'temporal')",
			);
			const { rows } = await cliente.query(
				"SELECT version FROM prueba_documentos WHERE id = '01936f2e-8c3a-7b4d-9e5f-000000000009'",
			);
			expect(Number(rows[0]?.version)).toBeLessThan(424242);
			// Mejor aún: la app ni siquiera puede crear objetos temporales.
			expect(creada).toBe(false);
		} finally {
			cliente.release();
		}
	});

	it("la version sale de una sola secuencia para todas las tablas", async () => {
		await base
			.insert(catalogo)
			.values({ id: "01936f2e-8c3a-7b4d-9e5f-000000000003", nombre: "Instituto Juan Pablo II" });
		await base.insert(documentos).values({ id: "01936f2e-8c3a-7b4d-9e5f-000000000004", nombre: "R-0452" });
		const [deCatalogo] = await base.select().from(catalogo);
		const [ultimo] = await base
			.select()
			.from(documentos)
			.where(eq(documentos.id, "01936f2e-8c3a-7b4d-9e5f-000000000004"));
		expect((ultimo?.version ?? 0) - (deCatalogo?.version ?? 0)).toBe(1);
	});
});
