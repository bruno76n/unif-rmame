/**
 * La base de cada archivo de pruebas: una copia de la plantilla, con el rol de la app.
 * Fase 2 · docs/cimientos/PRUEBAS.md («Postgres real»)
 *
 * Cada archivo de pruebas pide su copia (`CREATE DATABASE … TEMPLATE`), así nadie pisa a nadie. Cada
 * prueba corre dentro de una transacción que se deshace al final, así deja la base como la encontró.
 */

import { randomUUID } from "node:crypto";
import pg from "pg";
import { inject } from "vitest";
import type { BaseDePruebasCompartida } from "./contexto.ts";

/** Una base copia de la plantilla, con sus dos conexiones. */
export interface BaseDePrueba {
	nombre: string;
	/** Con el rol de la app: con esta trabaja la prueba. */
	app: pg.Pool;
	/** Con el rol dueño: para crear lo que la prueba necesita (tablas de prueba, permisos). */
	dueno: pg.Pool;
	/** Cierra las conexiones y borra la copia. */
	borrar: () => Promise<void>;
}

/** Los datos para conectarse a una base con un rol. */
function conexion(compartida: BaseDePruebasCompartida, rol: "dueno" | "app", base: string): pg.ClientConfig {
	const { usuario, clave } = compartida[rol];
	return { host: compartida.host, port: compartida.puerto, user: usuario, password: clave, database: base };
}

/**
 * Crea la base de un archivo de pruebas, copiada de la plantilla.
 * @returns La base con sus dos conexiones; se borra con `borrar()` en el `afterAll` del archivo.
 */
export async function crearBaseDePrueba(): Promise<BaseDePrueba> {
	const compartida = inject("baseDePruebas");
	const nombre = `prueba_${randomUUID().replaceAll("-", "")}`;
	const administrador = new pg.Client(conexion(compartida, "dueno", "postgres"));
	await administrador.connect();
	try {
		await administrador.query(`CREATE DATABASE ${nombre} TEMPLATE ${compartida.plantilla}`);
	} finally {
		await administrador.end();
	}
	const app = new pg.Pool(conexion(compartida, "app", nombre));
	const dueno = new pg.Pool(conexion(compartida, "dueno", nombre));
	return {
		nombre,
		app,
		dueno,
		borrar: async () => {
			await Promise.all([app.end(), dueno.end()]);
			const cierre = new pg.Client(conexion(compartida, "dueno", "postgres"));
			await cierre.connect();
			try {
				await cierre.query(`DROP DATABASE IF EXISTS ${nombre} WITH (FORCE)`);
			} finally {
				await cierre.end();
			}
		},
	};
}

/**
 * Corre una prueba dentro de una transacción que se deshace al final, pase lo que pase.
 * @param pool La conexión con la que trabaja la prueba.
 * @param prueba Lo que hace la prueba, con su cliente dentro de la transacción.
 * @returns Lo que regresa la prueba.
 */
export async function enTransaccionDeshecha<T>(
	pool: pg.Pool,
	prueba: (cliente: pg.PoolClient) => Promise<T>,
): Promise<T> {
	const cliente = await pool.connect();
	try {
		await cliente.query("BEGIN");
		return await prueba(cliente);
	} finally {
		await cliente.query("ROLLBACK");
		cliente.release();
	}
}
