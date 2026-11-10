/**
 * `pnpm base:migrar`: aplica las migraciones pendientes y luego la siembra del sistema.
 * Fase 2 · docs/cimientos/BASE-DE-DATOS.md («Migraciones» y «Siembra del sistema»)
 *
 * Corre con el rol dueño (`BASE_DATOS_URL_DUENO`). Las migraciones viven en `apps/api/migraciones/`;
 * después de ellas instala el esquema de Graphile Worker (fase 4).
 */

import { join } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type pg from "pg";
import { leerEntorno } from "../entorno.ts";
import { cargarModulos } from "../modulos.ts";
import { prepararEsquemaDelWorker } from "../trabajos/esquema.ts";
import { abrirConexiones, crearBase } from "./conexion.ts";
import { type Semilla, sembrarSistema } from "./siembra.ts";

/** La carpeta de las migraciones que escribe drizzle-kit. */
export const carpetaDeMigraciones = join(import.meta.dirname, "../../../migraciones");

/** La carpeta de los módulos de la API. */
const carpetaDeModulos = join(import.meta.dirname, "../../modulos");

/** Las semillas del sistema de todos los módulos: las junta `cargarModulos` de cada carpeta de `modulos/`. */
export async function semillasDelSistema(): Promise<readonly Semilla[]> {
	return (await cargarModulos(carpetaDeModulos)).semillas;
}

/**
 * Aplica las migraciones pendientes y siembra lo que falta.
 * @param destinoDueno La base con el rol dueño: su dirección o sus datos por separado.
 * @param semillas Las semillas; por omisión, las de todos los módulos.
 */
export async function migrarYSembrar(
	destinoDueno: string | pg.PoolConfig,
	semillas?: readonly Semilla[],
): Promise<void> {
	const conexiones = abrirConexiones(destinoDueno);
	try {
		const base = crearBase(conexiones);
		await migrate(base, { migrationsFolder: carpetaDeMigraciones });
		await prepararEsquemaDelWorker(conexiones);
		await sembrarSistema(base, semillas ?? (await semillasDelSistema()));
	} finally {
		await conexiones.end();
	}
}

if (import.meta.main) {
	const { BASE_DATOS_URL_DUENO } = leerEntorno();
	if (BASE_DATOS_URL_DUENO === undefined) {
		console.error("Falta BASE_DATOS_URL_DUENO: las migraciones corren con el rol dueño.");
		process.exit(1);
	}
	await migrarYSembrar(BASE_DATOS_URL_DUENO);
	console.log("Migraciones aplicadas y siembra del sistema al día.");
}
