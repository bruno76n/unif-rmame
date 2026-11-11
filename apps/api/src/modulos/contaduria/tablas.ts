/**
 * Las tablas de `contaduria` que se construyen antes de su fase: por ahora, solo `terceros`.
 * Fase 10 · docs/modulos/contaduria/terceros-y-deudas.md («La tabla `terceros`») y
 * docs/fases/10-patronaje-y-compras.md («Excepciones permitidas»)
 *
 * Un proveedor no tiene nombre sin su tercero. Lo demás de Contaduría (compensaciones, deudas) llega en la fase 17.
 */

import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { columnasComunes, valores } from "../../nucleo/base/columnas.ts";

/** Qué es un acreedor nuevo. */
export const clasesDeTercero = ["persona", "empresa", "banco"] as const;

/** La ficha común de quien nos debe o a quien le debemos: cliente, proveedor o acreedor, o varios a la vez. */
export const terceros = pgTable(
	"terceros",
	{
		id: uuid("id").primaryKey(),
		nombre: text("nombre").notNull(),
		/** En minúsculas, sin acentos y sin espacios dobles: lo que hace único al nombre. */
		nombreBusqueda: text("nombre_busqueda").notNull(),
		clase: text("clase"),
		esCliente: boolean("es_cliente").notNull().default(false),
		esProveedor: boolean("es_proveedor").notNull().default(false),
		esAcreedor: boolean("es_acreedor").notNull().default(false),
		rfc: text("rfc"),
		telefono: text("telefono"),
		notas: text("notas"),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("terceros_nombre_busqueda").on(tabla.nombreBusqueda),
		index("terceros_rfc").on(tabla.rfc),
		check("terceros_nombre", sql`char_length(${tabla.nombre}) between 3 and 120`),
		check("terceros_clase", sql`${tabla.clase} in (${valores(clasesDeTercero)})`),
		check("terceros_un_rol", sql`${tabla.esCliente} or ${tabla.esProveedor} or ${tabla.esAcreedor}`),
		check("terceros_rfc", sql`${tabla.rfc} ~ '^[A-ZÑ&0-9]{12,13}$'`),
	],
);
