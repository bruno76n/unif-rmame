/**
 * Las tablas del módulo `inventario`: las ubicaciones, el libro de movimientos y las existencias.
 * Fase 4 · docs/modulos/inventario/libro-de-movimientos.md («La tabla `ubicaciones`»)
 * Fase 9 · docs/modulos/inventario/libro-de-movimientos.md («La tabla `movimientos`», «La tabla
 * `movimiento_lineas`») y existencias-y-cuadre.md («La tabla `existencias`», «La tabla `existencias_material`»)
 *
 * `ubicaciones` nace en la fase 4 con su siembra porque antes la usan los parámetros, las impresoras, las
 * cuentas, los aparatos y las personas. El libro solo crece: el rol de la app no lo puede cambiar.
 */

import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	boolean,
	check,
	date,
	index,
	integer,
	numeric,
	pgTable,
	smallint,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { columnasComunes, columnasDeAparato, columnasDeBaja, momento } from "../../nucleo/base/columnas.ts";
import { comandosRecibidos } from "../admin/tablas.ts";
import { variantes } from "../catalogo/tablas.ts";
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

/** Los tipos de movimiento: qué hecho movió inventario (docs/modulos/inventario/libro-de-movimientos.md). */
export const tiposDeMovimiento = [
	"carga_inicial",
	"venta_tienda",
	"devolucion_mostrador",
	"merma_tienda",
	"salida_tienda",
	"surtido_bodega",
	"recepcion_aduana",
	"piezas_cortadas",
	"merma_produccion",
	"recepcion_taller",
	"recepcion_reproceso",
	"despacho",
	"recepcion_despacho",
	"entrega_cliente_externo",
	"entrega_tienda_sin_caja",
	"salida_linea",
	"devolucion_cliente_externo",
	"devolucion_linea",
	"merma_calidad",
	"recepcion_proveedor",
	"devolucion_proveedor",
	"entrega_corte",
	"consumo_corte",
	"merma_corte",
	"regreso_rollo",
	"regreso_retazo",
	"consumo_avios",
	"consumible_tomado",
	"ajuste",
	"aclaracion_recepcion",
	"reversion",
] as const;

/** El tipo de un movimiento. */
export type TipoDeMovimiento = (typeof tiposDeMovimiento)[number];

/** Los documentos que piden un movimiento. */
export const tiposDeDocumentoDeMovimiento = [
	"carga_inicial",
	"conteo",
	"venta_tienda",
	"devolucion_mostrador",
	"merma_tienda",
	"salida_tienda",
	"traspaso",
	"recepcion",
	"despacho",
	"nota_entrega",
	"pedido_linea",
	"corte",
	"registro_operacion",
	"toma_consumible",
	"entrega_corte",
	"ajuste",
	"diferencia",
	"reproceso",
] as const;

/** Escribe una lista como los valores de un CHECK: `'a', 'b'`. */
function valores(lista: readonly string[]) {
	return sql.raw(lista.map((valor) => `'${valor}'`).join(", "));
}

/** El encabezado del libro: un hecho que movió inventario. Solo crece. */
export const movimientos = pgTable(
	"movimientos",
	{
		id: uuid("id").primaryKey(),
		tipo: text("tipo").notNull(),
		fecha: date("fecha", { mode: "string" }).notNull(),
		ocurridoEn: momento("ocurrido_en").notNull(),
		documentoTipo: text("documento_tipo").notNull(),
		documentoId: uuid("documento_id").notNull(),
		documentoFolio: text("documento_folio"),
		revierteMovimientoId: uuid("revierte_movimiento_id").references((): AnyPgColumn => movimientos.id),
		claveIdempotencia: uuid("clave_idempotencia").notNull(),
		comandoId: uuid("comando_id").references((): AnyPgColumn => comandosRecibidos.id),
		...columnasDeAparato(),
		nota: text("nota"),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("movimientos_clave").on(tabla.claveIdempotencia),
		index("movimientos_documento").on(tabla.documentoTipo, tabla.documentoId),
		index("movimientos_tipo_fecha").on(tabla.tipo, tabla.fecha),
		index("movimientos_ocurrido").on(tabla.ocurridoEn),
		uniqueIndex("movimientos_revierte")
			.on(tabla.revierteMovimientoId)
			.where(sql`${tabla.revierteMovimientoId} is not null`),
		check("movimientos_tipo", sql`${tabla.tipo} in (${valores(tiposDeMovimiento)})`),
		check("movimientos_documento_tipo", sql`${tabla.documentoTipo} in (${valores(tiposDeDocumentoDeMovimiento)})`),
		check("movimientos_reversion", sql`(${tabla.tipo} = 'reversion') = (${tabla.revierteMovimientoId} is not null)`),
	],
);

/** Cada renglón del libro: una cantidad positiva de una variante o de un material, de una ubicación a otra. */
export const movimientoLineas = pgTable(
	"movimiento_lineas",
	{
		id: uuid("id").primaryKey(),
		movimientoId: uuid("movimiento_id")
			.notNull()
			.references(() => movimientos.id),
		renglon: smallint("renglon").notNull(),
		origenUbicacionId: uuid("origen_ubicacion_id").references(() => ubicaciones.id),
		destinoUbicacionId: uuid("destino_ubicacion_id").references(() => ubicaciones.id),
		varianteId: uuid("variante_id").references(() => variantes.id),
		/** @llavePendiente materiales.id */
		materialId: uuid("material_id"),
		/** @llavePendiente rollos.id */
		rolloId: uuid("rollo_id"),
		/** @llavePendiente lotes.id */
		loteId: uuid("lote_id"),
		piezas: integer("piezas"),
		cantidad: numeric("cantidad", { precision: 12, scale: 3 }),
		/** @llavePendiente traspasos.id */
		traspasoId: uuid("traspaso_id"),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("movimiento_lineas_renglon").on(tabla.movimientoId, tabla.renglon),
		index("movimiento_lineas_origen").on(tabla.origenUbicacionId, tabla.varianteId),
		index("movimiento_lineas_destino").on(tabla.destinoUbicacionId, tabla.varianteId),
		index("movimiento_lineas_material").on(tabla.materialId, tabla.rolloId),
		index("movimiento_lineas_lote").on(tabla.loteId),
		index("movimiento_lineas_traspaso").on(tabla.traspasoId),
		check(
			"movimiento_lineas_un_lado",
			sql`${tabla.origenUbicacionId} is not null or ${tabla.destinoUbicacionId} is not null`,
		),
		check(
			"movimiento_lineas_lados_distintos",
			sql`${tabla.origenUbicacionId} is distinct from ${tabla.destinoUbicacionId}`,
		),
		check(
			"movimiento_lineas_forma",
			sql`(${tabla.varianteId} is not null and ${tabla.piezas} > 0 and ${tabla.materialId} is null and ${tabla.cantidad} is null and ${tabla.rolloId} is null)
				or (${tabla.materialId} is not null and ${tabla.cantidad} > 0 and ${tabla.varianteId} is null and ${tabla.piezas} is null)`,
		),
	],
);

/** Cuántas piezas de cada variante hay en cada ubicación: la suma del libro. Puede ser negativa. */
export const existencias = pgTable(
	"existencias",
	{
		id: uuid("id").primaryKey(),
		ubicacionId: uuid("ubicacion_id")
			.notNull()
			.references(() => ubicaciones.id),
		varianteId: uuid("variante_id")
			.notNull()
			.references(() => variantes.id),
		piezas: integer("piezas").notNull().default(0),
		ultimoMovimientoId: uuid("ultimo_movimiento_id").references(() => movimientos.id),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("existencias_ubicacion_variante").on(tabla.ubicacionId, tabla.varianteId),
		index("existencias_variante").on(tabla.varianteId),
		index("existencias_version").on(tabla.version),
	],
);

/** Cuánto material hay en cada ubicación: la tela por rollo, los avíos y consumibles por material. */
export const existenciasMaterial = pgTable(
	"existencias_material",
	{
		id: uuid("id").primaryKey(),
		ubicacionId: uuid("ubicacion_id")
			.notNull()
			.references(() => ubicaciones.id),
		/** @llavePendiente materiales.id */
		materialId: uuid("material_id").notNull(),
		/** @llavePendiente rollos.id */
		rolloId: uuid("rollo_id"),
		cantidad: numeric("cantidad", { precision: 12, scale: 3 }).notNull().default("0"),
		ultimoMovimientoId: uuid("ultimo_movimiento_id").references(() => movimientos.id),
		...columnasComunes(),
	},
	(tabla) => [
		unique("existencias_material_lugar").on(tabla.ubicacionId, tabla.materialId, tabla.rolloId).nullsNotDistinct(),
		index("existencias_material_rollo").on(tabla.rolloId),
		index("existencias_material_version").on(tabla.version),
	],
);
