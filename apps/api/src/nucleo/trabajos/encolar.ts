/**
 * Encolar una tarea de Graphile Worker dentro de una transacción.
 * Fase 4 · docs/cimientos/EVENTOS-Y-TRABAJOS.md («El worker»)
 *
 * Se encola con `graphile_worker.add_job` en la misma transacción: si la transacción no confirma, la tarea
 * no existe. Con `clave`, dos encolados de lo mismo dejan una sola tarea pendiente.
 */

import { sql } from "drizzle-orm";
import type { Transaccion } from "../base/transacciones.ts";
import { esquemaDelWorker } from "./esquema.ts";

/** Cómo se encola una tarea. */
export interface Encolado {
	/** El nombre de la tarea: `procesar_eventos`, `admin.depurar_eventos`. */
	tarea: string;
	carga?: Record<string, unknown>;
	/** Su cola: las tareas de una misma cola corren de una en una. */
	cola?: string;
	/** Una tarea pendiente con la misma clave se reemplaza, en lugar de encolar otra. */
	clave?: string;
	/** Cuántas veces la intenta Graphile Worker antes de darla por fallida (por omisión, 25). */
	intentos?: number;
	/** Si ya hay una pendiente con la misma clave, conserva su hora (`preserve_run_at`). */
	conservarHora?: boolean;
}

/**
 * Encola una tarea en la transacción.
 * @param transaccion La transacción en curso.
 * @param encolado La tarea, su carga, su cola y su clave.
 */
export async function encolar(transaccion: Transaccion, encolado: Encolado): Promise<void> {
	await transaccion.execute(sql`SELECT ${sql.raw(esquemaDelWorker)}.add_job(
		${encolado.tarea},
		payload => ${JSON.stringify(encolado.carga ?? {})}::json,
		queue_name => ${encolado.cola ?? null},
		job_key => ${encolado.clave ?? null},
		max_attempts => ${encolado.intentos ?? null}::integer,
		job_key_mode => ${encolado.conservarHora === true ? "preserve_run_at" : "replace"}
	)`);
}
