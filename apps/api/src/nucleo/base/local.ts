/**
 * `pnpm local`: levanta Postgres en Docker, aplica las migraciones y la siembra, y deja entrar al rol de la app.
 * Fase 2 · docs/cimientos/ARQUITECTURA.md («Cómo corre en local»)
 *
 * Lee `.env` (copia de `.env.ejemplo`, con `ENTORNO=local`). La clave del rol de la app sale de
 * `BASE_DATOS_URL`, así que no vive en el código. La API, el worker, la web y la tablet se suman aquí
 * en la fase que los construye.
 */

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import pg from "pg";
import { leerEntorno } from "../entorno.ts";
import { migrarYSembrar } from "./migrar.ts";

const raiz = join(import.meta.dirname, "../../../../..");

if (import.meta.main) {
	const entorno = leerEntorno();
	if (entorno.ENTORNO !== "local" || entorno.BASE_DATOS_URL_DUENO === undefined) {
		console.error("pnpm local corre solo con ENTORNO=local y BASE_DATOS_URL_DUENO en .env.");
		process.exit(1);
	}
	const docker = spawnSync("docker", ["compose", "up", "-d", "--wait", "base"], { cwd: raiz, stdio: "inherit" });
	if (docker.status !== 0) process.exit(1);
	await migrarYSembrar(entorno.BASE_DATOS_URL_DUENO);
	const app = new URL(entorno.BASE_DATOS_URL);
	if (app.username !== "uniformame_app") {
		console.error("BASE_DATOS_URL tiene que entrar con el rol uniformame_app.");
		process.exit(1);
	}
	const administrador = new pg.Client({ connectionString: entorno.BASE_DATOS_URL_DUENO });
	await administrador.connect();
	try {
		// El rol lo crea la primera migración sin entrada; en local entra con la clave de BASE_DATOS_URL.
		const clave = await administrador.query("SELECT quote_literal($1) AS clave", [decodeURIComponent(app.password)]);
		await administrador.query(`ALTER ROLE ${app.username} LOGIN PASSWORD ${clave.rows[0].clave}`);
	} finally {
		await administrador.end();
	}
	console.log("Local: Postgres arriba, migraciones y siembra al día, y el rol de la app con entrada.");
}
