/**
 * Las tablas de `compras`: proveedores, materiales, qué proveedores surten cada material y el historial de precios
 * de compra.
 * Fase 10 · docs/modulos/compras/proveedores-y-precios.md y materiales.md (la tabla de cada archivo)
 *
 * Nada se borra: un proveedor, un material o un par se dan de baja. El historial de precios solo crece: el rol de
 * la app no lo puede cambiar. Los materiales bajan a la tablet (los consumibles), así que llevan `xid_escritura`.
 */

import { tiposDeMaterial, unidadesDeReceta } from "@uniformame/compartido/contratos/compras/materiales";
import { sql } from "drizzle-orm";
import { bigint, check, date, index, integer, numeric, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { columnasComunes, columnasDeBaja, columnaXidEscritura, valores } from "../../nucleo/base/columnas.ts";
import { terceros } from "../contaduria/tablas.ts";

/** De dónde sale un precio del historial. */
export const origenesDePrecio = ["alta", "proveedor_agregado", "orden", "nota"] as const;

/** Un proveedor: su nombre y su RFC viven en su tercero. */
export const proveedores = pgTable(
	"proveedores",
	{
		id: uuid("id").primaryKey(),
		terceroId: uuid("tercero_id")
			.notNull()
			.references(() => terceros.id),
		ciudad: text("ciudad").notNull(),
		telefono: text("telefono").notNull(),
		diasCredito: integer("dias_credito").notNull(),
		diasDiceTardar: integer("dias_dice_tardar").notNull(),
		surte: text("surte"),
		...columnasDeBaja(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("proveedores_tercero").on(tabla.terceroId),
		check("proveedores_ciudad", sql`char_length(${tabla.ciudad}) between 2 and 60`),
		check("proveedores_telefono", sql`${tabla.telefono} ~ '^[0-9]{10}$'`),
		check("proveedores_dias_credito", sql`${tabla.diasCredito} >= 0`),
		check("proveedores_dias_dice_tardar", sql`${tabla.diasDiceTardar} > 0`),
		check("proveedores_surte", sql`char_length(${tabla.surte}) <= 120`),
	],
);

/** Una tela, un avío o un consumible del taller. */
export const materiales = pgTable(
	"materiales",
	{
		id: uuid("id").primaryKey(),
		nombre: text("nombre").notNull(),
		nombreNormalizado: text("nombre_normalizado").notNull(),
		tipo: text("tipo").notNull(),
		/** La clave de su unidad en la lista «Unidades de material». */
		unidad: text("unidad").notNull(),
		presentacion: text("presentacion"),
		unidadReceta: text("unidad_receta"),
		factorReceta: numeric("factor_receta", { precision: 12, scale: 3 }),
		unidadTablet: text("unidad_tablet"),
		factorTablet: numeric("factor_tablet", { precision: 12, scale: 3 }),
		color: text("color"),
		minimo: numeric("minimo", { precision: 12, scale: 3 }).notNull().default("0"),
		multiploCompra: numeric("multiplo_compra", { precision: 12, scale: 3 }).notNull().default("1"),
		diasCubre: integer("dias_cubre").notNull(),
		consumoDiarioInicial: numeric("consumo_diario_inicial", { precision: 12, scale: 3 }),
		proveedorHabitualId: uuid("proveedor_habitual_id")
			.notNull()
			.references(() => proveedores.id),
		...columnasDeBaja(),
		...columnasComunes(),
		...columnaXidEscritura(),
	},
	(tabla) => [
		uniqueIndex("materiales_nombre").on(tabla.nombreNormalizado),
		index("materiales_tipo").on(tabla.tipo).where(sql`${tabla.bajaEn} is null`),
		index("materiales_proveedor_habitual").on(tabla.proveedorHabitualId),
		check("materiales_nombre", sql`char_length(${tabla.nombre}) between 3 and 80`),
		check("materiales_tipo", sql`${tabla.tipo} in (${valores(tiposDeMaterial)})`),
		check("materiales_tela_en_metros", sql`${tabla.tipo} <> 'tela' or ${tabla.unidad} = 'm'`),
		check("materiales_presentacion", sql`char_length(${tabla.presentacion}) <= 60`),
		check("materiales_unidad_receta", sql`${tabla.unidadReceta} in (${valores(unidadesDeReceta)})`),
		check("materiales_factor_receta", sql`(${tabla.unidadReceta} is null) = (${tabla.factorReceta} is null)`),
		check("materiales_factor_receta_positivo", sql`${tabla.factorReceta} > 0`),
		check("materiales_tablet_consumible", sql`${tabla.unidadTablet} is null or ${tabla.tipo} = 'consumible'`),
		check("materiales_factor_tablet", sql`(${tabla.unidadTablet} is null) = (${tabla.factorTablet} is null)`),
		check("materiales_factor_tablet_positivo", sql`${tabla.factorTablet} > 0`),
		check("materiales_color", sql`${tabla.color} ~ '^#[0-9A-Fa-f]{6}$'`),
		check("materiales_minimo", sql`${tabla.minimo} >= 0`),
		check("materiales_multiplo_compra", sql`${tabla.multiploCompra} > 0`),
		check("materiales_dias_cubre", sql`${tabla.diasCubre} > 0`),
		check("materiales_consumo", sql`${tabla.consumoDiarioInicial} >= 0`),
	],
);

/** Qué proveedores surten cada material, con su último precio. Es parte del material (sube su versión). */
export const materialProveedores = pgTable(
	"material_proveedores",
	{
		id: uuid("id").primaryKey(),
		materialId: uuid("material_id")
			.notNull()
			.references(() => materiales.id),
		proveedorId: uuid("proveedor_id")
			.notNull()
			.references(() => proveedores.id),
		/** Copia del renglón más nuevo del historial de este par. */
		ultimoPrecioCentavos: bigint("ultimo_precio_centavos", { mode: "number" }).notNull(),
		...columnasDeBaja(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("material_proveedores_par").on(tabla.materialId, tabla.proveedorId),
		index("material_proveedores_proveedor").on(tabla.proveedorId),
		check("material_proveedores_precio", sql`${tabla.ultimoPrecioCentavos} > 0`),
	],
);

/** El historial de precios de compra. Solo crece. */
export const preciosCompra = pgTable(
	"precios_compra",
	{
		id: uuid("id").primaryKey(),
		materialId: uuid("material_id")
			.notNull()
			.references(() => materiales.id),
		proveedorId: uuid("proveedor_id")
			.notNull()
			.references(() => proveedores.id),
		precioCentavos: bigint("precio_centavos", { mode: "number" }).notNull(),
		origen: text("origen").notNull(),
		/** @llavePendiente ordenes_compra.id */
		ordenCompraId: uuid("orden_compra_id"),
		/** @llavePendiente orden_compra_lineas.id */
		ordenCompraLineaId: uuid("orden_compra_linea_id"),
		precioAnteriorCentavos: bigint("precio_anterior_centavos", { mode: "number" }),
		cambioPorcentaje: numeric("cambio_porcentaje", { precision: 6, scale: 3 }),
		/** Día de negocio. */
		fecha: date("fecha", { mode: "string" }).notNull(),
		...columnasComunes(),
	},
	(tabla) => [
		index("precios_compra_material").on(tabla.materialId, tabla.creadoEn.desc()),
		index("precios_compra_par").on(tabla.materialId, tabla.proveedorId, tabla.creadoEn.desc()),
		check("precios_compra_precio", sql`${tabla.precioCentavos} > 0`),
		check("precios_compra_origen", sql`${tabla.origen} in (${valores(origenesDePrecio)})`),
		check(
			"precios_compra_orden",
			sql`(${tabla.origen} in ('orden', 'nota')) = (${tabla.ordenCompraId} is not null and ${tabla.ordenCompraLineaId} is not null)`,
		),
		check(
			"precios_compra_cambio",
			sql`(${tabla.precioAnteriorCentavos} is null) = (${tabla.cambioPorcentaje} is null)`,
		),
	],
);
