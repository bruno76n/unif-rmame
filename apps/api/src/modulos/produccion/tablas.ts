/**
 * Las tablas de `produccion`: las operaciones del taller, los flujos y las operaciones de cada flujo.
 * Fase 12 · docs/modulos/produccion/operaciones-y-flujos.md («La tabla `operaciones`», «La tabla `flujos`» y
 * «La tabla `flujo_operaciones`»)
 *
 * Las tres bajan a la tablet del taller, así que llevan `xid_escritura`. El único del orden de un flujo se revisa al
 * final de la transacción: es una exclusión diferida que escribe la migración a mano, porque al agregar o quitar una
 * operación las siguientes recorren su orden.
 */

import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	boolean,
	check,
	index,
	pgTable,
	smallint,
	text,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { columnasComunes, columnasDeBaja, columnaXidEscritura, momento } from "../../nucleo/base/columnas.ts";
import { usuarios } from "../admin/tablas.ts";
import { personas } from "../personal/tablas.ts";

/** El catálogo de operaciones que comparten los flujos; el corte es una sola. */
export const operaciones = pgTable(
	"operaciones",
	{
		id: uuid("id").primaryKey(),
		nombre: text("nombre").notNull(),
		esCorte: boolean("es_corte").notNull().default(false),
		...columnasDeBaja(),
		...columnasComunes(),
		...columnaXidEscritura(),
	},
	(tabla) => [
		uniqueIndex("operaciones_nombre").on(sql`lower(${tabla.nombre})`),
		uniqueIndex("operaciones_un_corte").on(tabla.esCorte).where(sql`${tabla.esCorte}`),
		index("operaciones_xid_escritura").on(tabla.xidEscritura),
		check("operaciones_nombre_largo", sql`char_length(${tabla.nombre}) between 1 and 40`),
	],
);

/** El flujo de una prenda: por qué operaciones pasa y en qué orden. */
export const flujos = pgTable(
	"flujos",
	{
		id: uuid("id").primaryKey(),
		nombre: text("nombre").notNull(),
		copiadoDeFlujoId: uuid("copiado_de_flujo_id").references((): AnyPgColumn => flujos.id),
		...columnasDeBaja(),
		...columnasComunes(),
		...columnaXidEscritura(),
	},
	(tabla) => [
		uniqueIndex("flujos_nombre").on(sql`lower(${tabla.nombre})`),
		index("flujos_xid_escritura").on(tabla.xidEscritura),
		check("flujos_nombre_largo", sql`char_length(${tabla.nombre}) between 1 and 60`),
	],
);

/** Cada operación de un flujo: su orden y quién la hace de base. Quitarla es darla de baja. */
export const flujoOperaciones = pgTable(
	"flujo_operaciones",
	{
		id: uuid("id").primaryKey(),
		flujoId: uuid("flujo_id")
			.notNull()
			.references(() => flujos.id),
		operacionId: uuid("operacion_id")
			.notNull()
			.references(() => operaciones.id),
		orden: smallint("orden").notNull(),
		personaBaseId: uuid("persona_base_id")
			.notNull()
			.references(() => personas.id),
		bajaEn: momento("baja_en"),
		bajaPor: uuid("baja_por").references((): AnyPgColumn => usuarios.id),
		motivoBaja: text("motivo_baja"),
		...columnasComunes(),
		...columnaXidEscritura(),
	},
	(tabla) => [
		uniqueIndex("flujo_operaciones_operacion").on(tabla.flujoId, tabla.operacionId).where(sql`${tabla.bajaEn} is null`),
		index("flujo_operaciones_flujo").on(tabla.flujoId),
		index("flujo_operaciones_persona").on(tabla.personaBaseId),
		index("flujo_operaciones_xid_escritura").on(tabla.xidEscritura),
		check("flujo_operaciones_orden", sql`${tabla.orden} > 0`),
	],
);
