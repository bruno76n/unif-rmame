/**
 * El arranque de las pruebas que tocan la base (`globalSetup` del proyecto «base» de Vitest).
 * Fase 2 · docs/cimientos/PRUEBAS.md («Postgres real»)
 *
 * Levanta un Postgres 18 con Testcontainers, aplica las migraciones, la siembra, los datos de la muestra y
 * las cuentas de prueba (con su sesión) en la base plantilla con el rol dueño, le da entrada al rol de la app y le pasa a cada archivo dónde quedó todo. Cada
 * archivo copia la plantilla con `crearBaseDePrueba` de `@uniformame/pruebas/base`.
 */

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { BaseDePruebasCompartida } from "@uniformame/pruebas/base/contexto";
import pg from "pg";
import type { TestProject } from "vitest/node";
import { cargasDeLaMuestra } from "../../../semillas/sembrar.ts";
import { sembrarCuentasDePrueba } from "../pruebas/cuentas-de-prueba.ts";
import { abrirConexiones, crearBase } from "./conexion.ts";
import { migrarYSembrar } from "./migrar.ts";

/** La imagen de Postgres: la misma versión mayor que producción. */
const imagen = "postgres:18";

/** Las claves de los roles de prueba; solo existen dentro del contenedor de la corrida. */
const roles = {
	dueno: { usuario: "uniformame_dueno", clave: "dueno" },
	app: { usuario: "uniformame_app", clave: "app" },
};

/** Arranca el Postgres de la corrida y regresa cómo apagarlo. */
export default async function arrancar(proyecto: TestProject): Promise<() => Promise<void>> {
	const contenedor = await new PostgreSqlContainer(imagen)
		.withUsername(roles.dueno.usuario)
		.withPassword(roles.dueno.clave)
		.withDatabase("plantilla")
		.start();
	await migrarYSembrar(contenedor.getConnectionUri());
	const conexiones = abrirConexiones(contenedor.getConnectionUri());
	try {
		const base = crearBase(conexiones);
		for (const cargar of cargasDeLaMuestra) await cargar(base);
		await sembrarCuentasDePrueba(base);
	} finally {
		await conexiones.end();
	}
	// El rol de la app lo crea la primera migración sin entrada; en las pruebas entra con su clave.
	const administrador = new pg.Client({ connectionString: contenedor.getConnectionUri() });
	await administrador.connect();
	try {
		await administrador.query(`ALTER ROLE ${roles.app.usuario} LOGIN PASSWORD '${roles.app.clave}'`);
	} finally {
		await administrador.end();
	}
	const compartida: BaseDePruebasCompartida = {
		host: contenedor.getHost(),
		puerto: contenedor.getPort(),
		...roles,
		plantilla: "plantilla",
		contenedor: contenedor.getId(),
	};
	proyecto.provide("baseDePruebas", compartida);
	return async () => {
		await contenedor.stop();
	};
}
