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
import { type AnyPgColumn, bigint, customType, text, timestamp, uuid } from "drizzle-orm/pg-core";
// Las tablas de `admin` importan estas columnas y estas columnas apuntan a `usuarios` y `dispositivos`: la referencia va en
// una función, así que el ciclo de importación no estorba.
import { dispositivos, usuarios } from "../../modulos/admin/tablas.ts";
import { personas } from "../../modulos/personal/tablas.ts";

/** Un momento: `timestamptz`. */
export function momento(nombre: string) {
	return timestamp(nombre, { withTimezone: true, mode: "string" });
}

/**
 * Una columna del tipo `xid8` de Postgres, que Drizzle no trae: el número de la transacción, como texto.
 * Es una función y no una constante porque `admin/tablas.ts` y este archivo se importan uno al otro.
 */
export function columnaXid8(nombre: string) {
	return customType<{ data: string; driverData: string }>({ dataType: () => "xid8" })(nombre);
}

/**
 * Las columnas de toda tabla de negocio: cuándo nació, quién la hizo, el último cambio y su versión.
 * @returns Las columnas para extender la definición de la tabla.
 */
export function columnasComunes() {
	return {
		creadoEn: momento("creado_en").notNull().defaultNow(),
		creadoPor: uuid("creado_por").references((): AnyPgColumn => usuarios.id),
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
		xidEscritura: columnaXid8("xid_escritura").notNull().default(sql`pg_current_xact_id()`),
	};
}

/** Las columnas de lo que llega de un aparato: cuál fue y quién cobró o registró (sin cuenta). */
export function columnasDeAparato() {
	return {
		dispositivoId: uuid("dispositivo_id").references((): AnyPgColumn => dispositivos.id),
		personaId: uuid("persona_id").references((): AnyPgColumn => personas.id),
	};
}

/** Las columnas de un documento que se cancela en lugar de borrarse. */
export function columnasDeCancelacion() {
	return {
		canceladoEn: momento("cancelado_en"),
		canceladoPor: uuid("cancelado_por").references((): AnyPgColumn => usuarios.id),
		motivoCancelacion: text("motivo_cancelacion"),
	};
}

/** Las columnas de un catálogo que se da de baja en lugar de borrarse, y se puede reactivar. */
export function columnasDeBaja() {
	return {
		bajaEn: momento("baja_en"),
		bajaPor: uuid("baja_por").references((): AnyPgColumn => usuarios.id),
		motivoBaja: text("motivo_baja"),
		reactivadoEn: momento("reactivado_en"),
	};
}

/**
 * Escribe una lista como los valores de un CHECK: `'a', 'b'`.
 * @param lista Los valores que acepta la columna (los del código, nunca de quien llama).
 */
export function valores(lista: readonly string[]) {
	return sql.raw(lista.map((valor) => `'${valor}'`).join(", "));
}
