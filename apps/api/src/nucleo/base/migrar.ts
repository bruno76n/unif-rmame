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
import { prepararEsquemaDelWorker } from "../trabajos/esquema.ts";
import { abrirConexiones, crearBase } from "./conexion.ts";
import { type Semilla, sembrarSistema } from "./siembra.ts";

/** La carpeta de las migraciones que escribe drizzle-kit. */
export const carpetaDeMigraciones = join(import.meta.dirname, "../../../migraciones");

/**
 * Las semillas del sistema de todos los módulos. Todavía no hay módulos: desde la fase 3,
 * `nucleo/modulos.ts` las junta de cada carpeta de `modulos/`.
 */
export function semillasDelSistema(): Semilla[] {
	return [];
}

/**
 * Aplica las migraciones pendientes y siembra lo que falta.
 * @param destinoDueno La base con el rol dueño: su dirección o sus datos por separado.
 * @param semillas Las semillas; por omisión, las de todos los módulos.
 */
export async function migrarYSembrar(
	destinoDueno: string | pg.PoolConfig,
	semillas: readonly Semilla[] = semillasDelSistema(),
): Promise<void> {
	const conexiones = abrirConexiones(destinoDueno);
	try {
		const base = crearBase(conexiones);
		await migrate(base, { migrationsFolder: carpetaDeMigraciones });
		await prepararEsquemaDelWorker(conexiones);
		await sembrarSistema(base, semillas);
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
