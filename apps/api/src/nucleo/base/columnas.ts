/**
 * Las columnas que comparten las tablas de negocio, para el `tablas.ts` de cada módulo.
 * Fase 2 · docs/cimientos/BASE-DE-DATOS.md («Columnas comunes» y «Nada se borra»)
 *
 * `version`, `actualizado_en` y `xid_escritura` las pone el disparador `columnas_comunes` (ver
 * `migraciones/0000_base.sql` y `0001_disparador_seguro.sql`): sus valores por omisión solo sirven para que Drizzle no las pida al
 * insertar, y el disparador los pisa. Por eso el de `version` es 0 y no `nextval`: así cada
 * escritura gasta un solo número de la secuencia. Cada migración que crea una tabla de negocio llama a
 * `poner_disparador_comun('<tabla>', baja_a_aparatos => <true|false>)` en su SQL.
 */

import { sql } from "drizzle-orm";
import { bigint, customType, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Un momento: `timestamptz`. */
function momento(nombre: string) {
	return timestamp(nombre, { withTimezone: true, mode: "string" });
}

/** El tipo `xid8` de Postgres, que Drizzle no trae: el número de la transacción, como texto. */
const xid8 = customType<{ data: string; driverData: string }>({ dataType: () => "xid8" });

/**
 * Las columnas de toda tabla de negocio: cuándo nació, quién la hizo, el último cambio y su versión.
 * @returns Las columnas para extender la definición de la tabla.
 */
export function columnasComunes() {
	return {
		creadoEn: momento("creado_en").notNull().defaultNow(),
		/** @llavePendiente usuarios.id */
		creadoPor: uuid("creado_por"),
		actualizadoEn: momento("actualizado_en"),
		version: bigint("version", { mode: "number" }).notNull().default(0),
	};
}

/**
 * La columna de las tablas que bajan a un aparato: el número de la transacción que escribió el renglón.
 * Lleva índice; la sincronización entrega los cambios hasta un tope seguro con ella.
 */
export function columnaXidEscritura() {
	return {
		xidEscritura: xid8("xid_escritura").notNull().default(sql`pg_current_xact_id()`),
	};
}

/** Las columnas de lo que llega de un aparato: cuál fue y quién cobró o registró (sin cuenta). */
export function columnasDeAparato() {
	return {
		/** @llavePendiente dispositivos.id */
		dispositivoId: uuid("dispositivo_id"),
		/** @llavePendiente personas.id */
		personaId: uuid("persona_id"),
	};
}

/** Las columnas de un documento que se cancela en lugar de borrarse. */
export function columnasDeCancelacion() {
	return {
		canceladoEn: momento("cancelado_en"),
		/** @llavePendiente usuarios.id */
		canceladoPor: uuid("cancelado_por"),
		motivoCancelacion: text("motivo_cancelacion"),
	};
}

/** Las columnas de un catálogo que se da de baja en lugar de borrarse, y se puede reactivar. */
export function columnasDeBaja() {
	return {
		bajaEn: momento("baja_en"),
		/** @llavePendiente usuarios.id */
		bajaPor: uuid("baja_por"),
		motivoBaja: text("motivo_baja"),
		reactivadoEn: momento("reactivado_en"),
	};
}
