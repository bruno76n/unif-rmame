/**
 * Las tablas de `compras`: proveedores, materiales, qué proveedores surten cada material, el historial de precios
 * de compra y las órdenes de compra con sus líneas.
 * Fase 10 · docs/modulos/compras/proveedores-y-precios.md, materiales.md y ordenes-de-compra.md (la tabla de cada
 * archivo)
 *
 * Nada se borra: un proveedor, un material o un par se dan de baja. El historial de precios solo crece: el rol de
 * la app no lo puede cambiar. Los materiales bajan a la tablet (los consumibles), así que llevan `xid_escritura`.
 */

import { tiposDeMaterial, unidadesDeReceta } from "@uniformame/compartido/contratos/compras/materiales";
import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	bigint,
	check,
	date,
	index,
	integer,
	numeric,
	pgTable,
	text,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import {
	columnasComunes,
	columnasDeBaja,
	columnasDeCancelacion,
	columnaXidEscritura,
	momento,
	valores,
} from "../../nucleo/base/columnas.ts";
import { archivos, usuarios } from "../admin/tablas.ts";
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
		ordenCompraId: uuid("orden_compra_id").references((): AnyPgColumn => ordenesCompra.id),
		ordenCompraLineaId: uuid("orden_compra_linea_id").references((): AnyPgColumn => ordenCompraLineas.id),
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

/** Los estados de una orden de compra. */
export const estadosDeOrden = [
	"borrador",
	"enviada",
	"recibida_en_parte",
	"recibida",
	"cerrada",
	"cerrada_con_faltante",
	"cancelada",
] as const;

/** Lo que se le pide a un proveedor (OC-). Un solo borrador por proveedor. */
export const ordenesCompra = pgTable(
	"ordenes_compra",
	{
		id: uuid("id").primaryKey(),
		folio: text("folio").notNull(),
		proveedorId: uuid("proveedor_id")
			.notNull()
			.references(() => proveedores.id),
		estado: text("estado").notNull().default("borrador"),
		/** El día en que se levantó. */
		fecha: date("fecha", { mode: "string" }).notNull(),
		fechaPrometida: date("fecha_prometida", { mode: "string" }),
		enviadaEn: momento("enviada_en"),
		enviadaPor: uuid("enviada_por").references((): AnyPgColumn => usuarios.id),
		/** La condición del proveedor, copiada al enviarla. */
		diasCredito: integer("dias_credito"),
		pdfArchivoId: uuid("pdf_archivo_id").references(() => archivos.id),
		cerradaEn: momento("cerrada_en"),
		/** Vacío: la cerró el sistema al quedar pagada. */
		cerradaPor: uuid("cerrada_por").references((): AnyPgColumn => usuarios.id),
		motivoCierre: text("motivo_cierre"),
		...columnasDeCancelacion(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("ordenes_compra_folio").on(tabla.folio),
		uniqueIndex("ordenes_compra_un_borrador").on(tabla.proveedorId).where(sql`${tabla.estado} = 'borrador'`),
		index("ordenes_compra_estado").on(tabla.estado, tabla.fechaPrometida),
		index("ordenes_compra_proveedor").on(tabla.proveedorId, tabla.enviadaEn.desc()),
		check("ordenes_compra_estado", sql`${tabla.estado} in (${valores(estadosDeOrden)})`),
		check(
			"ordenes_compra_enviada",
			sql`${tabla.enviadaEn} is null or (${tabla.fechaPrometida} is not null and ${tabla.diasCredito} is not null)`,
		),
		check(
			"ordenes_compra_cerrada_con_faltante",
			sql`${tabla.estado} <> 'cerrada_con_faltante' or (${tabla.cerradaEn} is not null and ${tabla.motivoCierre} is not null)`,
		),
		check("ordenes_compra_cerrada", sql`${tabla.estado} <> 'cerrada' or ${tabla.cerradaEn} is not null`),
		check(
			"ordenes_compra_cancelada",
			sql`(${tabla.estado} = 'cancelada') = (${tabla.canceladoEn} is not null and ${tabla.motivoCancelacion} is not null)`,
		),
	],
);

/** Cada material de una orden. Es parte de la orden: un cambio sube su versión. */
export const ordenCompraLineas = pgTable(
	"orden_compra_lineas",
	{
		id: uuid("id").primaryKey(),
		ordenCompraId: uuid("orden_compra_id")
			.notNull()
			.references(() => ordenesCompra.id),
		materialId: uuid("material_id")
			.notNull()
			.references(() => materiales.id),
		/** Lo pedido, en la unidad de inventario. */
		cantidad: numeric("cantidad", { precision: 12, scale: 3 }).notNull(),
		/** El precio escrito, que se congela al enviarla. */
		precioOrdenCentavos: bigint("precio_orden_centavos", { mode: "number" }).notNull(),
		precioNotaCentavos: bigint("precio_nota_centavos", { mode: "number" }),
		precioNotaEn: momento("precio_nota_en"),
		precioNotaPor: uuid("precio_nota_por").references((): AnyPgColumn => usuarios.id),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("orden_compra_lineas_material").on(tabla.ordenCompraId, tabla.materialId),
		index("orden_compra_lineas_material_pedido").on(tabla.materialId),
		check("orden_compra_lineas_cantidad", sql`${tabla.cantidad} > 0`),
		check("orden_compra_lineas_precio", sql`${tabla.precioOrdenCentavos} > 0`),
		check("orden_compra_lineas_precio_nota", sql`${tabla.precioNotaCentavos} > 0`),
		check("orden_compra_lineas_nota", sql`(${tabla.precioNotaCentavos} is null) = (${tabla.precioNotaEn} is null)`),
	],
);
