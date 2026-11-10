/**
 * La base de cada archivo de pruebas: una copia de la plantilla, con el rol de la app.
 * Fase 2 · docs/cimientos/PRUEBAS.md («Postgres real»)
 *
 * Cada archivo de pruebas pide su copia (`CREATE DATABASE … TEMPLATE`), así nadie pisa a nadie. Cada
 * prueba corre dentro de una transacción que se deshace al final, así deja la base como la encontró.
 */

import { randomUUID } from "node:crypto";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
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
		// Postgres no copia los permisos de la base con la plantilla: se repite el de la migración 0001.
		await administrador.query(`REVOKE TEMPORARY ON DATABASE ${nombre} FROM PUBLIC`);
	} finally {
		await administrador.end();
	}
	const app = new pg.Pool(conexion(compartida, "app", nombre));
	const dueno = new pg.Pool(conexion(compartida, "dueno", nombre));
	// Al borrar la base con FORCE, Postgres corta las conexiones que quedaron sin usar (57P01) y el grupo
	// lo avisa con un evento «error»: sin quién lo escuche, Vitest lo cuenta como error no atrapado.
	for (const grupo of [app, dueno]) grupo.on("error", () => undefined);
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

/** La transacción de Drizzle que recibe una prueba que se deshace. */
export type TransaccionDeshecha = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];

/** La señal para deshacer la transacción de la prueba al final. */
class Deshacer extends Error {}

/**
 * Corre una prueba dentro de una transacción de Drizzle que se deshace al final, pase lo que pase.
 * Lo que la prueba corra adentro con transacciones (también `enTransaccion` de la API) queda en
 * `SAVEPOINT`s de esta, así que el final también lo deshace.
 * @param pool La conexión con la que trabaja la prueba.
 * @param prueba Lo que hace la prueba, con la transacción.
 * @returns Lo que regresa la prueba.
 */
export async function enTransaccionDeshecha<T>(
	pool: pg.Pool,
	prueba: (transaccion: TransaccionDeshecha) => Promise<T>,
): Promise<T> {
	let resultado: { valor: T } | undefined;
	try {
		await drizzle({ client: pool }).transaction(async (transaccion) => {
			resultado = { valor: await prueba(transaccion) };
			throw new Deshacer();
		});
	} catch (error) {
		if (!(error instanceof Deshacer)) throw error;
	}
	if (resultado === undefined) throw new Error("la prueba no terminó");
	return resultado.valor;
}

/** Una base vacía, sin migraciones, para probar que las migraciones aplican desde cero. */
export interface BaseVacia {
	/** Los datos para conectarse con el rol dueño. */
	dueno: pg.ClientConfig;
	borrar: () => Promise<void>;
}

/**
 * Crea una base vacía, sin copiar la plantilla.
 * @returns Sus datos de conexión con el rol dueño y cómo borrarla.
 */
export async function crearBaseVacia(): Promise<BaseVacia> {
	const compartida = inject("baseDePruebas");
	const nombre = `vacia_${randomUUID().replaceAll("-", "")}`;
	const administrador = new pg.Client(conexion(compartida, "dueno", "postgres"));
	await administrador.connect();
	try {
		await administrador.query(`CREATE DATABASE ${nombre}`);
	} finally {
		await administrador.end();
	}
	return {
		dueno: conexion(compartida, "dueno", nombre),
		borrar: async () => {
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
