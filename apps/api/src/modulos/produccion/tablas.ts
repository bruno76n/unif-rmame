/**
 * Las tablas de `produccion`: las operaciones del taller, los flujos y las operaciones de cada flujo.
 * Fase 12 · docs/modulos/produccion/operaciones-y-flujos.md («La tabla `operaciones`», «La tabla `flujos`» y
 * «La tabla `flujo_operaciones`»); parte 2 · ordenes-de-produccion.md («La tabla `ordenes_produccion`») y lotes.md
 * («La tabla `lotes`», «La tabla `lote_tallas`»)
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
	date,
	index,
	integer,
	pgTable,
	smallint,
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
import { usuarios } from "../admin/tablas.ts";
import { productos, variantes } from "../catalogo/tablas.ts";
import { ubicaciones } from "../inventario/tablas.ts";
import { recetaVersiones } from "../patronaje/tablas.ts";
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

/** Por qué se fabrica: cada motivo dice cómo nacen sus lotes. */
export const motivosDeOrden = ["cliente_externo", "temporada", "reabasto", "pedido_especial"] as const;

/** La orden de producción OP- que manda fabricar y agrupa sus lotes. */
export const ordenesProduccion = pgTable(
	"ordenes_produccion",
	{
		id: uuid("id").primaryKey(),
		folio: text("folio").notNull(),
		motivo: text("motivo", { enum: motivosDeOrden }).notNull(),
		/** @llavePendiente pedidos.id */
		pedidoId: uuid("pedido_id"),
		/** @llavePendiente pedido_versiones.id */
		pedidoVersionId: uuid("pedido_version_id"),
		ubicacionDestinoId: uuid("ubicacion_destino_id").references(() => ubicaciones.id),
		/** @llavePendiente pedidos_especiales_tienda.id */
		pedidoEspecialTiendaId: uuid("pedido_especial_tienda_id"),
		referencia: text("referencia"),
		fecha: date("fecha", { mode: "string" }).notNull(),
		fechaEntrega: date("fecha_entrega", { mode: "string" }).notNull(),
		estado: text("estado", { enum: ["abierta", "cancelada"] })
			.notNull()
			.default("abierta"),
		...columnasDeCancelacion(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("ordenes_produccion_folio").on(tabla.folio),
		uniqueIndex("ordenes_produccion_pedido_especial").on(tabla.pedidoEspecialTiendaId),
		index("ordenes_produccion_pedido").on(tabla.pedidoId),
		index("ordenes_produccion_motivo").on(tabla.motivo, tabla.estado),
		check("ordenes_produccion_motivo", sql`${tabla.motivo} in (${valores(motivosDeOrden)})`),
		check("ordenes_produccion_estado", sql`${tabla.estado} in ('abierta', 'cancelada')`),
		check("ordenes_produccion_pedido", sql`(${tabla.motivo} = 'cliente_externo') = (${tabla.pedidoId} is not null)`),
		check(
			"ordenes_produccion_destino",
			sql`(${tabla.motivo} in ('temporada', 'reabasto', 'pedido_especial')) = (${tabla.ubicacionDestinoId} is not null)`,
		),
		check(
			"ordenes_produccion_especial",
			sql`(${tabla.pedidoEspecialTiendaId} is not null) <= (${tabla.motivo} = 'pedido_especial')`,
		),
		check("ordenes_produccion_referencia", sql`char_length(${tabla.referencia}) <= 120`),
		check("ordenes_produccion_entrega", sql`${tabla.fechaEntrega} >= ${tabla.fecha}`),
		check("ordenes_produccion_quien", sql`${tabla.creadoPor} is not null`),
	],
);

/** Las etapas de un lote. */
export const etapasDeLote = ["por_cortar", "en_proceso", "terminado", "revisado", "en_aduana", "cancelado"] as const;

/** El lote L-: una prenda con sus tallas, que se corta junta y avanza junta. */
export const lotes = pgTable(
	"lotes",
	{
		id: uuid("id").primaryKey(),
		folio: text("folio").notNull(),
		ordenProduccionId: uuid("orden_produccion_id")
			.notNull()
			.references(() => ordenesProduccion.id),
		productoId: uuid("producto_id")
			.notNull()
			.references(() => productos.id),
		flujoId: uuid("flujo_id").references(() => flujos.id),
		recetaVersionId: uuid("receta_version_id").references(() => recetaVersiones.id),
		destino: text("destino", { enum: ["pedido", "tienda", "temporada"] }).notNull(),
		/** @llavePendiente pedidos.id */
		pedidoId: uuid("pedido_id"),
		ubicacionDestinoId: uuid("ubicacion_destino_id").references(() => ubicaciones.id),
		pasoATemporadaEn: momento("paso_a_temporada_en"),
		estado: text("estado", { enum: etapasDeLote }).notNull().default("por_cortar"),
		fechaCorte: date("fecha_corte", { mode: "string" }).notNull(),
		fechaEntrega: date("fecha_entrega", { mode: "string" }).notNull(),
		cortadoEn: momento("cortado_en"),
		terminadoEn: momento("terminado_en"),
		revisadoEn: momento("revisado_en"),
		enAduanaEn: momento("en_aduana_en"),
		...columnasDeCancelacion(),
		...columnasComunes(),
		...columnaXidEscritura(),
	},
	(tabla) => [
		uniqueIndex("lotes_folio").on(tabla.folio),
		index("lotes_orden").on(tabla.ordenProduccionId),
		index("lotes_estado_corte").on(tabla.estado, tabla.fechaCorte),
		index("lotes_estado_entrega").on(tabla.estado, tabla.fechaEntrega),
		index("lotes_pedido").on(tabla.pedidoId),
		index("lotes_producto").on(tabla.productoId, tabla.estado),
		index("lotes_flujo").on(tabla.flujoId).where(sql`${tabla.estado} = 'en_proceso'`),
		index("lotes_xid_escritura").on(tabla.xidEscritura),
		check("lotes_estado", sql`${tabla.estado} in (${valores(etapasDeLote)})`),
		check("lotes_destino", sql`${tabla.destino} in ('pedido', 'tienda', 'temporada')`),
		check(
			"lotes_cortado",
			sql`(${tabla.estado} in ('por_cortar', 'cancelado')) = (${tabla.flujoId} is null and ${tabla.recetaVersionId} is null)`,
		),
		check("lotes_pedido", sql`${tabla.destino} <> 'pedido' or ${tabla.pedidoId} is not null`),
		check(
			"lotes_ubicacion",
			sql`(${tabla.destino} in ('tienda', 'temporada')) = (${tabla.ubicacionDestinoId} is not null)`,
		),
	],
);

/** Lo que lleva cada talla de un lote: planeadas, cortadas y, como proyección de los registros, terminadas y merma. */
export const loteTallas = pgTable(
	"lote_tallas",
	{
		id: uuid("id").primaryKey(),
		loteId: uuid("lote_id")
			.notNull()
			.references(() => lotes.id),
		varianteId: uuid("variante_id")
			.notNull()
			.references(() => variantes.id),
		piezasPlaneadas: integer("piezas_planeadas").notNull(),
		piezasCortadas: integer("piezas_cortadas"),
		piezasTerminadas: integer("piezas_terminadas").notNull().default(0),
		piezasMerma: integer("piezas_merma").notNull().default(0),
		piezasABodega: integer("piezas_a_bodega").notNull().default(0),
		...columnasComunes(),
		...columnaXidEscritura(),
	},
	(tabla) => [
		uniqueIndex("lote_tallas_variante").on(tabla.loteId, tabla.varianteId),
		index("lote_tallas_de_variante").on(tabla.varianteId),
		index("lote_tallas_xid_escritura").on(tabla.xidEscritura),
		check("lote_tallas_planeadas", sql`${tabla.piezasPlaneadas} >= 0`),
		check("lote_tallas_cortadas", sql`${tabla.piezasCortadas} >= 0`),
		check(
			"lote_tallas_a_bodega",
			sql`${tabla.piezasABodega} >= 0 and ${tabla.piezasABodega} <= coalesce(${tabla.piezasCortadas}, 0)`,
		),
	],
);

/** Los tipos de aviso que suma `produccion` al CHECK de `avisos.tipo` (con su migración). */
export const tiposDeAvisoDeProduccion = ["lote_atorado"] as const;
