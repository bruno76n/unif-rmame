/**
 * Prueba de las migraciones desde cero y de la siembra del sistema.
 * Fase 2 · docs/fases/02-base-de-datos-y-pruebas.md (parte 3)
 */

import { type BaseVacia, crearBaseVacia } from "@uniformame/pruebas/base";
import { eq } from "drizzle-orm";
import { pgTable, text } from "drizzle-orm/pg-core";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { abrirConexiones, crearBase } from "./conexion.ts";
import { migrarYSembrar } from "./migrar.ts";
import { sembrarSistema } from "./siembra.ts";

/** Una tabla de prueba con un parámetro y su valor inicial, como la que sembraría un módulo. */
const parametros = pgTable("prueba_parametros", {
	clave: text("clave").primaryKey(),
	valor: text("valor").notNull(),
});
const semillas = [{ tabla: parametros, filas: [{ clave: "produccion.dias_lote_atorado", valor: "2" }] }];

describe("las migraciones aplican desde cero sobre una base vacía; la siembra corre dos veces y la segunda no cambia nada, ni siquiera un valor que se cambió a mano", () => {
	let vacia: BaseVacia;
	let dueno: pg.Pool;

	beforeAll(async () => {
		vacia = await crearBaseVacia();
		dueno = abrirConexiones(vacia.dueno);
	});
	afterAll(async () => {
		await dueno.end();
		await vacia.borrar();
	});

	it("todas las migraciones aplican desde cero, y aplicarlas otra vez no hace nada", async () => {
		await migrarYSembrar(vacia.dueno);
		await migrarYSembrar(vacia.dueno);
		const secuencia = await dueno.query("SELECT 1 FROM pg_sequences WHERE sequencename = 'version_global'");
		expect(secuencia.rowCount).toBe(1);
		const sinAcentos = await dueno.query("SELECT sin_acentos('Instituto JUAN Pablo II · Educación') AS texto");
		expect(sinAcentos.rows[0].texto).toBe("instituto juan pablo ii · educacion");
	});

	it("la siembra agrega lo que falta y, la segunda vez, no cambia nada aunque la dueña haya cambiado el valor", async () => {
		await dueno.query("CREATE TABLE prueba_parametros (clave text PRIMARY KEY, valor text NOT NULL)");
		const base = crearBase(dueno);
		expect(await sembrarSistema(base, semillas)).toBe(1);
		await base.update(parametros).set({ valor: "3" }).where(eq(parametros.clave, "produccion.dias_lote_atorado"));
		expect(await sembrarSistema(base, semillas)).toBe(0);
		const [renglon] = await base.select().from(parametros);
		expect(renglon?.valor).toBe("3");
	});
});
