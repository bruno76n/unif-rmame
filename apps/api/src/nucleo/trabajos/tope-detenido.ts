/**
 * El tope detenido: cada minuto, con el reloj, revisa si una transacción abierta frena el tope seguro de la
 * sincronización y avisa a soporte una vez por episodio.
 * Fase 6 · docs/cimientos/SINCRONIZACION.md («El tope detenido»)
 *
 * El tope seguro es el número de la transacción más vieja que sigue abierta (`pg_snapshot_xmin`): no avanza
 * mientras esa transacción no termine. Así que el tope lleva detenido lo que lleva abierta la transacción
 * más vieja que ya escribió (la que tiene número) en esta base; el rol de la app ve las de su mismo rol,
 * que son las de la API y el worker. Si son `sync.minutos_tope_detenido` o más, avisa
 * `trabajo_fallido` a soporte. El episodio es esa transacción (su proceso y su inicio), y se anota como una
 * vuelta en `trabajos_vueltas`: el mismo episodio no vuelve a avisar.
 */

import { sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { trabajosVueltas } from "../../modulos/admin/tablas.ts";
import type { ContextoDeTrabajo } from "../modulos.ts";
import { leerParametro } from "../parametros.ts";

/** El nombre con que se anota cada episodio y se avisa. */
export const trabajoDelTope = "sync.tope_detenido";

/** La transacción abierta más vieja que ya escribió: su proceso y desde cuándo. */
const masVieja = z.object({ pid: z.number(), desde: z.string() }).optional();

/**
 * Revisa el tope y avisa si lleva detenido el tiempo del parámetro.
 * @param contexto El contexto de la vuelta del reloj: la base, la hora y cómo avisar a soporte.
 * @returns Los minutos que lleva detenido, o `undefined` si nada lo frena.
 */
export async function revisarTopeDetenido(contexto: ContextoDeTrabajo): Promise<number | undefined> {
	const { rows } = await contexto.base.execute(sql`
		SELECT pid, to_char(xact_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS desde
		FROM pg_stat_activity
		WHERE datname = current_database() AND pid <> pg_backend_pid()
			AND backend_xid IS NOT NULL AND xact_start IS NOT NULL
		ORDER BY age(backend_xid) DESC
		LIMIT 1`);
	const abierta = masVieja.parse(rows[0]);
	if (abierta === undefined) return undefined;
	const minutos = Math.floor(Temporal.Instant.from(abierta.desde).until(contexto.ahora).total("minutes"));
	const limite = Number(await leerParametro(contexto.base, { clave: "sync.minutos_tope_detenido" }));
	if (minutos < limite) return minutos;
	const nuevo = await contexto.base
		.insert(trabajosVueltas)
		.values({ trabajo: trabajoDelTope, periodo: `${abierta.pid}:${abierta.desde}`, terminadoEn: sql`now()` })
		.onConflictDoNothing()
		.returning({ periodo: trabajosVueltas.periodo });
	if (nuevo.length > 0) {
		await contexto.avisarFalla(
			"El tope de la sincronización",
			`una transacción abierta desde hace ${minutos} minutos no deja bajar los cambios a ningún aparato`,
		);
	}
	return minutos;
}
