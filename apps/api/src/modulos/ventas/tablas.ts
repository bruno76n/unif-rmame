/**
 * Las tablas de `ventas`: por ahora, los clientes externos.
 * Fase 16 · docs/modulos/ventas/clientes.md («La tabla `clientes`»)
 *
 * El nombre y el RFC del cliente viven en su tercero; aquí, lo que necesita Ventas para venderle y Aduana para
 * despacharle. Con esta tabla dejan su `@llavePendiente` las columnas que apuntan a los clientes.
 */

import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { columnasComunes, columnasDeBaja, valores } from "../../nucleo/base/columnas.ts";
import { escuelas } from "../catalogo/tablas.ts";
import { terceros } from "../contaduria/tablas.ts";

/** Los tres tipos de cliente; el tipo no cambia. */
export const tiposDeCliente = ["escuela", "mayorista", "empresa_otro"] as const;

/** El cliente externo: escuela, mayorista o empresa u otro. */
export const clientes = pgTable(
	"clientes",
	{
		id: uuid("id").primaryKey(),
		terceroId: uuid("tercero_id")
			.notNull()
			.references(() => terceros.id),
		tipo: text("tipo").notNull(),
		escuelaId: uuid("escuela_id").references(() => escuelas.id),
		municipio: text("municipio").notNull(),
		direccionEntrega: text("direccion_entrega").notNull(),
		contacto: text("contacto"),
		telefono: text("telefono").notNull(),
		correo: text("correo"),
		...columnasDeBaja(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("clientes_tercero").on(tabla.terceroId),
		uniqueIndex("clientes_escuela").on(tabla.escuelaId).where(sql`${tabla.escuelaId} is not null`),
		index("clientes_tipo").on(tabla.tipo).where(sql`${tabla.bajaEn} is null`),
		check("clientes_tipo", sql`${tabla.tipo} in (${valores(tiposDeCliente)})`),
		check("clientes_escuela", sql`(${tabla.escuelaId} is not null) = (${tabla.tipo} = 'escuela')`),
		check("clientes_municipio", sql`char_length(${tabla.municipio}) between 3 and 60`),
		check("clientes_direccion", sql`char_length(${tabla.direccionEntrega}) between 8 and 200`),
		check("clientes_contacto", sql`char_length(${tabla.contacto}) <= 60`),
		check("clientes_telefono", sql`${tabla.telefono} ~ '^[0-9]{10}$'`),
		check("clientes_baja", sql`(${tabla.bajaEn} is null) = (${tabla.motivoBaja} is null)`),
	],
);
