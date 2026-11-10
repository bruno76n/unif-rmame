/**
 * Prueba de los permisos del rol de la app.
 * Fase 2 · docs/fases/02-base-de-datos-y-pruebas.md (parte 2)
 */

import { type BaseDePrueba, crearBaseDePrueba } from "@uniformame/pruebas/base";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { codigoDePostgres } from "./transacciones.ts";

/** El código de Postgres de «permiso denegado». */
const permisoDenegado = "42501";

describe("con el rol de la app no se puede borrar en una tabla de negocio ni cambiar una que solo crece", () => {
	let prueba: BaseDePrueba;

	/** Corre una sentencia con el rol de la app y regresa el código de Postgres si falló. */
	async function conLaApp(sentencia: string): Promise<string | undefined> {
		return prueba.app.query(sentencia).then(
			() => undefined,
			(error: unknown) => codigoDePostgres(error),
		);
	}

	beforeAll(async () => {
		prueba = await crearBaseDePrueba();
		// Como en una migración: el dueño crea las tablas; los permisos por omisión las comparten con la app.
		await prueba.dueno.query("CREATE TABLE prueba_pedidos (id integer PRIMARY KEY, estado text NOT NULL)");
		await prueba.dueno.query("CREATE TABLE prueba_bitacora (id integer PRIMARY KEY, que text NOT NULL)");
		await prueba.dueno.query("SELECT marcar_solo_crece('prueba_bitacora')");
	});
	afterAll(async () => {
		await prueba.borrar();
	});

	it("en una tabla de negocio la app lee, agrega y cambia", async () => {
		expect(await conLaApp("INSERT INTO prueba_pedidos VALUES (1, 'borrador')")).toBeUndefined();
		expect(await conLaApp("UPDATE prueba_pedidos SET estado = 'cancelado' WHERE id = 1")).toBeUndefined();
		expect(await conLaApp("SELECT * FROM prueba_pedidos")).toBeUndefined();
	});

	it("en una tabla de negocio la app no puede borrar", async () => {
		expect(await conLaApp("DELETE FROM prueba_pedidos WHERE id = 1")).toBe(permisoDenegado);
		expect(await conLaApp("TRUNCATE prueba_pedidos")).toBe(permisoDenegado);
	});

	it("en una tabla que solo crece la app agrega, pero no cambia ni borra", async () => {
		expect(await conLaApp("INSERT INTO prueba_bitacora VALUES (1, 'entró')")).toBeUndefined();
		expect(await conLaApp("UPDATE prueba_bitacora SET que = 'otra cosa'")).toBe(permisoDenegado);
		expect(await conLaApp("DELETE FROM prueba_bitacora")).toBe(permisoDenegado);
	});

	it("la app no puede crear tablas, poner el disparador ni marcar tablas: eso es de las migraciones", async () => {
		expect(await conLaApp("CREATE TABLE prueba_otra (id integer)")).toBe(permisoDenegado);
		expect(await conLaApp("SELECT poner_disparador_comun('prueba_pedidos')")).toBe(permisoDenegado);
		expect(await conLaApp("SELECT marcar_solo_crece('prueba_pedidos')")).toBe(permisoDenegado);
	});

	it("una transacción de la app que se queda abierta sin hacer nada se corta al minuto", async () => {
		const { rows } = await prueba.app.query("SHOW idle_in_transaction_session_timeout");
		expect(rows[0]?.idle_in_transaction_session_timeout).toBe("1min");
	});
});
