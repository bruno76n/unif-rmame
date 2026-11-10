/**
 * `pnpm local`: levanta Postgres y el almacén compatible con S3 en Docker, aplica las migraciones y la
 * siembra, deja entrar al rol de la app, crea los cubos y arranca el worker.
 * Fase 2 · docs/cimientos/ARQUITECTURA.md («Cómo corre en local»)
 * Fase 4 · docs/cimientos/EVENTOS-Y-TRABAJOS.md («El worker»)
 * Fase 5 · docs/modulos/admin/acceso-con-google.md («En local y en las pruebas»): la API y el Google de
 * desarrollo.
 *
 * Lee `.env` (copia de `.env.ejemplo`, con `ENTORNO=local`). La clave del rol de la app sale de
 * `BASE_DATOS_URL`, así que no vive en el código. La API, el worker, la web y la tablet se suman aquí
 * en la fase que los construye.
 */

import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import pg from "pg";
import { cubos } from "../almacen.ts";
import { type Entorno, leerEntorno } from "../entorno.ts";
import { migrarYSembrar } from "./migrar.ts";

const raiz = join(import.meta.dirname, "../../../../..");

/**
 * Crea los dos cubos en el almacén local, si no están. Pide `R2_DIRECCION` y la credencial de archivos, que
 * en local es la del contenedor (`compose.yaml`).
 */
async function crearCubosLocales(entorno: Entorno): Promise<void> {
	if (
		entorno.R2_DIRECCION === undefined ||
		entorno.R2_ARCHIVOS_LLAVE_ID === undefined ||
		entorno.R2_ARCHIVOS_SECRETO === undefined
	) {
		throw new Error("pnpm local pide R2_DIRECCION, R2_ARCHIVOS_LLAVE_ID y R2_ARCHIVOS_SECRETO en .env.");
	}
	const s3 = new S3Client({
		endpoint: entorno.R2_DIRECCION,
		region: "auto",
		forcePathStyle: true,
		credentials: { accessKeyId: entorno.R2_ARCHIVOS_LLAVE_ID, secretAccessKey: entorno.R2_ARCHIVOS_SECRETO },
	});
	for (const cubo of Object.values(cubos)) {
		await s3.send(new CreateBucketCommand({ Bucket: cubo })).catch((error: unknown) => {
			if (!(error instanceof Error && error.name === "BucketAlreadyOwnedByYou")) throw error;
		});
	}
}

if (import.meta.main) {
	const entorno = leerEntorno();
	if (entorno.ENTORNO !== "local" || entorno.BASE_DATOS_URL_DUENO === undefined) {
		console.error("pnpm local corre solo con ENTORNO=local y BASE_DATOS_URL_DUENO en .env.");
		process.exit(1);
	}
	const docker = spawnSync("docker", ["compose", "up", "-d", "--wait", "base", "almacen"], {
		cwd: raiz,
		stdio: "inherit",
	});
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
	await crearCubosLocales(entorno);
	console.log("Local: Postgres y el almacén arriba, migraciones y siembra al día, y el rol de la app con entrada.");
	// La API, el worker y el Google de desarrollo corren en primer plano: Ctrl+C los detiene.
	spawn(process.execPath, ["--env-file-if-exists=../../.env", "src/api.ts"], {
		cwd: join(raiz, "apps/api"),
		stdio: "inherit",
	});
	spawn(process.execPath, ["--env-file-if-exists=../../.env", "src/trabajos.ts"], {
		cwd: join(raiz, "apps/api"),
		stdio: "inherit",
	});
	if (entorno.GOOGLE_EMISOR !== undefined && new URL(entorno.GOOGLE_EMISOR).hostname === "localhost") {
		spawn(process.execPath, ["--env-file-if-exists=../../.env", "src/nucleo/acceso/google-local.ts"], {
			cwd: join(raiz, "apps/api"),
			stdio: "inherit",
		});
	}
}
