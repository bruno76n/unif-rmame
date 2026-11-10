/**
 * Prueba de las transacciones con reintento, con dos conexiones a la vez.
 * Fase 2 · docs/fases/02-base-de-datos-y-pruebas.md (parte 1)
 */

import { type BaseDePrueba, crearBaseDePrueba } from "@uniformame/pruebas/base";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Base, crearBase } from "./conexion.ts";
import { codigoDePostgres, enTransaccion, reintentosPorChoque } from "./transacciones.ts";

describe("dos transacciones que se cruzan por los mismos renglones en el orden fijo terminan las dos; una que choca por bloqueo se reintenta sola y a la cuarta responde el error", () => {
	let prueba: BaseDePrueba;
	let base: Base;

	beforeAll(async () => {
		prueba = await crearBaseDePrueba();
		await prueba.dueno.query("CREATE TABLE prueba_cuentas (id integer PRIMARY KEY, saldo integer NOT NULL)");
		await prueba.dueno.query("INSERT INTO prueba_cuentas VALUES (1, 100), (2, 100)");
		base = crearBase(prueba.app);
	});
	afterAll(async () => {
		await prueba.borrar();
	});

	/** Bloquea dos renglones en el orden dado, con una pausa en medio para que la otra transacción se cruce. */
	function moverEnOrden(primero: number, segundo: number, alIntentar: () => void) {
		return enTransaccion(base, async (transaccion) => {
			alIntentar();
			await transaccion.execute(sql`SELECT saldo FROM prueba_cuentas WHERE id = ${primero} FOR UPDATE`);
			await transaccion.execute(sql`SELECT pg_sleep(0.3)`);
			await transaccion.execute(sql`SELECT saldo FROM prueba_cuentas WHERE id = ${segundo} FOR UPDATE`);
			await transaccion.execute(sql`UPDATE prueba_cuentas SET saldo = saldo + 1 WHERE id IN (${primero}, ${segundo})`);
		});
	}

	it("dos transacciones en el orden fijo terminan las dos, sin reintentos", async () => {
		let intentos = 0;
		await Promise.all([moverEnOrden(1, 2, () => intentos++), moverEnOrden(1, 2, () => intentos++)]);
		expect(intentos).toBe(2);
	});

	it("dos transacciones en orden cruzado chocan por bloqueo (40P01): la que pierde se reintenta sola y terminan las dos", async () => {
		const antes = await prueba.dueno.query("SELECT sum(saldo)::int AS total FROM prueba_cuentas");
		let intentos = 0;
		await Promise.all([moverEnOrden(1, 2, () => intentos++), moverEnOrden(2, 1, () => intentos++)]);
		expect(intentos).toBe(3);
		const despues = await prueba.dueno.query("SELECT sum(saldo)::int AS total FROM prueba_cuentas");
		expect(despues.rows[0].total - antes.rows[0].total).toBe(4);
	});

	it("una que choca siempre se intenta cuatro veces y a la cuarta responde el error", async () => {
		let intentos = 0;
		const error = await enTransaccion(base, async (transaccion) => {
			intentos++;
			await transaccion.execute(sql`DO $$ BEGIN RAISE EXCEPTION 'choque' USING ERRCODE = '40001'; END $$`);
		}).catch((e: unknown) => e);
		expect(codigoDePostgres(error)).toBe("40001");
		expect(intentos).toBe(reintentosPorChoque + 1);
	});

	it("un error que no es choque no se reintenta", async () => {
		let intentos = 0;
		const error = await enTransaccion(base, async (transaccion) => {
			intentos++;
			await transaccion.execute(sql`SELECT 1 / 0`);
		}).catch((e: unknown) => e);
		expect(codigoDePostgres(error)).toBe("22012");
		expect(intentos).toBe(1);
	});
});
