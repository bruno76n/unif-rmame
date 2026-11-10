/**
 * Las tablas del módulo `inventario` que ya existen.
 * Fase 4 · docs/modulos/inventario/libro-de-movimientos.md («La tabla `ubicaciones`»)
 *
 * `ubicaciones` es de `inventario` (fase 9), pero nace en la fase 4 con su siembra porque antes la usan
 * los parámetros, las impresoras, las cuentas, los aparatos y las personas.
 */

import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	boolean,
	check,
	pgTable,
	smallint,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { columnasComunes, columnasDeBaja } from "../../nucleo/base/columnas.ts";
import { personas } from "../personal/tablas.ts";

/** Cada lugar donde puede estar una pieza: Aduana, Bodega, las tiendas, el Taller y los dos de paso. */
export const ubicaciones = pgTable(
	"ubicaciones",
	{
		id: uuid("id").primaryKey(),
		codigo: text("codigo").notNull(),
		nombre: text("nombre").notNull(),
		tipo: text("tipo").notNull(),
		responsablePersonaId: uuid("responsable_persona_id").references((): AnyPgColumn => personas.id),
		prefijoFolio: text("prefijo_folio"),
		surteEnLinea: boolean("surte_en_linea").notNull().default(false),
		existenciaDesde: timestamp("existencia_desde", { withTimezone: true, mode: "string" }),
		orden: smallint("orden").notNull(),
		...columnasDeBaja(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("ubicaciones_codigo").on(tabla.codigo),
		uniqueIndex("ubicaciones_prefijo_folio").on(tabla.prefijoFolio),
		uniqueIndex("ubicaciones_una_por_tipo")
			.on(tabla.tipo)
			.where(sql`${tabla.tipo} <> 'tienda' and ${tabla.bajaEn} is null`),
		check(
			"ubicaciones_tipo",
			sql`${tabla.tipo} in ('aduana', 'bodega', 'tienda', 'taller', 'transito', 'en_camino_aduana')`,
		),
	],
);
