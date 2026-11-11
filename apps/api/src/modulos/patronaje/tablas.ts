/**
 * Las tablas de `patronaje`: la receta de cada prenda, sus versiones y lo que cuelga de ellas (los materiales, sus
 * cantidades por talla y las medidas).
 * Fase 10 · docs/modulos/patronaje/recetas.md (las tablas)
 *
 * Una versión guardada no cambia: las versiones, sus líneas, sus tallas y sus medidas solo crecen. La receta es el
 * agregado: guardar cualquier parte sube su versión.
 */

import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	check,
	foreignKey,
	index,
	integer,
	numeric,
	pgTable,
	text,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { columnasComunes, momento, valores } from "../../nucleo/base/columnas.ts";
import { productos, tallas } from "../catalogo/tablas.ts";
import { materiales } from "../compras/tablas.ts";

/** Los estados de una receta. */
export const estadosDeReceta = ["sin_receta", "sin_verificar", "verificada"] as const;

/** El papel de un material en la receta. */
export const papelesDeLinea = ["tela_principal", "combinacion", "forro", "avio"] as const;

/** Si un material va igual en todas las tallas o cambia por talla. */
export const modosDeLinea = ["igual", "por_talla"] as const;

/** Las unidades en que se captura un material en la receta. */
export const unidadesDeLinea = ["m", "cm", "pza"] as const;

/** La receta de un producto: una por producto de una sección que lleva receta. */
export const recetas = pgTable(
	"recetas",
	{
		id: uuid("id").primaryKey(),
		productoId: uuid("producto_id")
			.notNull()
			.references(() => productos.id),
		estado: text("estado").notNull().default("sin_receta"),
		versionVigenteId: uuid("version_vigente_id"),
		verificadaEn: momento("verificada_en"),
		/** @llavePendiente lotes.id */
		verificadaLoteId: uuid("verificada_lote_id"),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("recetas_producto").on(tabla.productoId),
		index("recetas_estado").on(tabla.estado),
		foreignKey({
			name: "recetas_version_vigente",
			columns: [tabla.versionVigenteId, tabla.id],
			foreignColumns: [recetaVersiones.id, recetaVersiones.recetaId],
		}),
		check("recetas_estado", sql`${tabla.estado} in (${valores(estadosDeReceta)})`),
		check("recetas_vigente", sql`(${tabla.versionVigenteId} is null) = (${tabla.estado} = 'sin_receta')`),
		check("recetas_verificada", sql`(${tabla.verificadaEn} is not null) = (${tabla.estado} = 'verificada')`),
	],
);

/** Una versión de la receta. Solo crece. */
export const recetaVersiones = pgTable(
	"receta_versiones",
	{
		id: uuid("id").primaryKey(),
		recetaId: uuid("receta_id")
			.notNull()
			.references((): AnyPgColumn => recetas.id),
		numero: integer("numero").notNull(),
		motivo: text("motivo").notNull(),
		copiadaDeVersionId: uuid("copiada_de_version_id").references((): AnyPgColumn => recetaVersiones.id),
		...columnasComunes(),
	},
	(tabla) => [
		unique("receta_versiones_de_su_receta").on(tabla.id, tabla.recetaId),
		uniqueIndex("receta_versiones_numero").on(tabla.recetaId, tabla.numero),
		check("receta_versiones_numero", sql`${tabla.numero} >= 1`),
		check("receta_versiones_motivo", sql`char_length(${tabla.motivo}) between 5 and 200`),
	],
);

/** Cada material de una versión. Solo crece. */
export const recetaLineas = pgTable(
	"receta_lineas",
	{
		id: uuid("id").primaryKey(),
		recetaVersionId: uuid("receta_version_id")
			.notNull()
			.references(() => recetaVersiones.id),
		papel: text("papel").notNull(),
		materialId: uuid("material_id")
			.notNull()
			.references(() => materiales.id),
		modo: text("modo").notNull(),
		unidadReceta: text("unidad_receta").notNull(),
		/** Por prenda, en `unidad_receta`, si va igual en todas las tallas. */
		cantidad: numeric("cantidad", { precision: 12, scale: 3 }),
		/** La conversión congelada: cuántas de la receta hacen una de inventario. */
		recetaPorUnidadInventario: numeric("receta_por_unidad_inventario", { precision: 12, scale: 3 }).notNull(),
		orden: integer("orden").notNull(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("receta_lineas_tela_principal").on(tabla.recetaVersionId).where(sql`${tabla.papel} = 'tela_principal'`),
		uniqueIndex("receta_lineas_material").on(tabla.recetaVersionId, tabla.materialId),
		index("receta_lineas_material_usado").on(tabla.materialId),
		check("receta_lineas_papel", sql`${tabla.papel} in (${valores(papelesDeLinea)})`),
		check("receta_lineas_modo", sql`${tabla.modo} in (${valores(modosDeLinea)})`),
		check("receta_lineas_unidad", sql`${tabla.unidadReceta} in (${valores(unidadesDeLinea)})`),
		check(
			"receta_lineas_tela",
			sql`${tabla.papel} = 'avio' or (${tabla.modo} = 'por_talla' and ${tabla.unidadReceta} = 'm')`,
		),
		check("receta_lineas_cantidad", sql`(${tabla.cantidad} is not null) = (${tabla.modo} = 'igual')`),
		check("receta_lineas_cantidad_positiva", sql`${tabla.cantidad} >= 0`),
		check("receta_lineas_conversion", sql`${tabla.recetaPorUnidadInventario} > 0`),
	],
);

/** La cantidad por talla de un material que cambia por talla. Solo crece. */
export const recetaLineaTallas = pgTable(
	"receta_linea_tallas",
	{
		id: uuid("id").primaryKey(),
		recetaLineaId: uuid("receta_linea_id")
			.notNull()
			.references(() => recetaLineas.id),
		tallaId: uuid("talla_id")
			.notNull()
			.references(() => tallas.id),
		cantidad: numeric("cantidad", { precision: 12, scale: 3 }).notNull(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("receta_linea_tallas_talla").on(tabla.recetaLineaId, tabla.tallaId),
		check("receta_linea_tallas_cantidad", sql`${tabla.cantidad} >= 0`),
	],
);

/** Las medidas de una versión, en centímetros, talla por talla. Solo crece. */
export const recetaMedidas = pgTable(
	"receta_medidas",
	{
		id: uuid("id").primaryKey(),
		recetaVersionId: uuid("receta_version_id")
			.notNull()
			.references(() => recetaVersiones.id),
		medida: text("medida").notNull(),
		orden: integer("orden").notNull(),
		tallaId: uuid("talla_id")
			.notNull()
			.references(() => tallas.id),
		valorCm: numeric("valor_cm", { precision: 12, scale: 3 }).notNull(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("receta_medidas_talla").on(tabla.recetaVersionId, sql`lower(${tabla.medida})`, tabla.tallaId),
		check("receta_medidas_medida", sql`char_length(${tabla.medida}) >= 3`),
	],
);
