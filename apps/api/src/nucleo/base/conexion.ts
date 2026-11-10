/**
 * La conexión a Postgres con `pg` y Drizzle.
 * Fase 2 · docs/cimientos/BASE-DE-DATOS.md («La base»)
 *
 * La API y el worker se conectan con el rol de la app; las migraciones, con el rol dueño.
 */

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

/** La base con Drizzle, como la usan los módulos. */
export type Base = NodePgDatabase;

/**
 * Abre el grupo de conexiones a una base.
 * @param direccion La dirección de Postgres (`BASE_DATOS_URL` o `BASE_DATOS_URL_DUENO`).
 * @returns El grupo de conexiones; se cierra con `end()`.
 */
export function abrirConexiones(direccion: string): pg.Pool {
	return new pg.Pool({ connectionString: direccion });
}

/**
 * Envuelve un grupo de conexiones con Drizzle.
 * @param conexiones El grupo de `abrirConexiones`.
 */
export function crearBase(conexiones: pg.Pool): Base {
	return drizzle({ client: conexiones });
}
