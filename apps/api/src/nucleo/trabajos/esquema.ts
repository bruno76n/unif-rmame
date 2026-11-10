/**
 * El esquema de Graphile Worker en la base: lo instala el rol dueño y la app lo usa.
 * Fase 4 · docs/cimientos/EVENTOS-Y-TRABAJOS.md («El worker»)
 *
 * Graphile Worker trae sus propias migraciones (el esquema `graphile_worker`). Las corre `base:migrar`
 * con el rol dueño, después de las nuestras; así el rol de la app nunca crea objetos en la base. Luego le
 * da a la app lo que el worker necesita en ese esquema: encolar desde una acción, tomar, terminar y quitar
 * sus propios trabajos. Sus tablas traen seguridad por renglón sin políticas (solo su dueño las toca), así
 * que cada una recibe una política para la app. Al arrancar, el worker con el rol de la app solo revisa
 * que ya esté al día.
 */

import { runMigrations } from "graphile-worker";
import type pg from "pg";

/** El esquema de Graphile Worker. */
export const esquemaDelWorker = "graphile_worker";

/**
 * Instala o pone al día el esquema de Graphile Worker y le da a la app sus permisos. Se puede correr
 * cuantas veces sea: lo que ya está no cambia.
 * @param conexiones El grupo de conexiones con el rol dueño.
 */
export async function prepararEsquemaDelWorker(conexiones: pg.Pool): Promise<void> {
	await runMigrations({ pgPool: conexiones, schema: esquemaDelWorker });
	await conexiones.query(`
		GRANT USAGE ON SCHEMA ${esquemaDelWorker} TO uniformame_app;
		GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${esquemaDelWorker} TO uniformame_app;
		GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${esquemaDelWorker} TO uniformame_app;
		GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${esquemaDelWorker} TO uniformame_app;
		DO $$
		DECLARE
			tabla regclass;
		BEGIN
			FOR tabla IN
				SELECT clase.oid::regclass FROM pg_class clase
				JOIN pg_namespace esquema ON esquema.oid = clase.relnamespace
				WHERE esquema.nspname = '${esquemaDelWorker}' AND clase.relrowsecurity
					AND NOT EXISTS (
						SELECT 1 FROM pg_policy WHERE polrelid = clase.oid AND polname = 'uniformame_app'
					)
			LOOP
				EXECUTE format('CREATE POLICY uniformame_app ON %s TO uniformame_app USING (true) WITH CHECK (true)', tabla);
			END LOOP;
		END
		$$;
	`);
}
