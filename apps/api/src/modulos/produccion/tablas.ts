/**
 * Las tablas de `produccion`: las operaciones del taller, los flujos y las operaciones de cada flujo.
 * Fase 12 · docs/modulos/produccion/operaciones-y-flujos.md («La tabla `operaciones`», «La tabla `flujos`» y
 * «La tabla `flujo_operaciones`»); parte 2 · ordenes-de-produccion.md («La tabla `ordenes_produccion`») y lotes.md
 * («La tabla `lotes`», «La tabla `lote_tallas`»); parte 3 · corte-y-bultos.md («La tabla `cortes`», `corte_telas`,
 * `corte_rollos` y `bultos`); parte 4 · registros-de-operacion.md («La tabla `registros_operacion`»)
 *
 * Las tres bajan a la tablet del taller, así que llevan `xid_escritura`. El único del orden de un flujo se revisa al
 * final de la transacción: es una exclusión diferida que escribe la migración a mano, porque al agregar o quitar una
 * operación las siguientes recorren su orden.
 */

import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	bigint,
	boolean,
	check,
	date,
	index,
	integer,
	numeric,
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
import { dispositivos, usuarios } from "../admin/tablas.ts";
import { productos, variantes } from "../catalogo/tablas.ts";
import { materiales } from "../compras/tablas.ts";
import { apartadosRollo, excepciones, retazos, rollos, ubicaciones } from "../inventario/tablas.ts";
import { recetaVersiones } from "../patronaje/tablas.ts";
import { personas, tarifasOperacion } from "../personal/tablas.ts";
import { pedidos, pedidoVersiones } from "../ventas/tablas.ts";

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
		pedidoId: uuid("pedido_id").references((): AnyPgColumn => pedidos.id),
		pedidoVersionId: uuid("pedido_version_id").references((): AnyPgColumn => pedidoVersiones.id),
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
		pedidoId: uuid("pedido_id").references((): AnyPgColumn => pedidos.id),
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

/** El corte de un lote: se captura cerrado, uno por lote, y nunca cambia. */
export const cortes = pgTable(
	"cortes",
	{
		id: uuid("id").primaryKey(),
		loteId: uuid("lote_id")
			.notNull()
			.references(() => lotes.id),
		fecha: date("fecha", { mode: "string" }).notNull(),
		cerradoEn: momento("cerrado_en").notNull(),
		cortoPersonaId: uuid("corto_persona_id")
			.notNull()
			.references(() => personas.id),
		verificoReceta: boolean("verifico_receta").notNull(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("cortes_lote").on(tabla.loteId),
		index("cortes_fecha").on(tabla.fecha),
		check("cortes_quien", sql`${tabla.creadoPor} is not null`),
	],
);

/** Los papeles de una tela en la receta. */
export const papelesDeTela = ["tela_principal", "combinacion", "forro"] as const;

/** Cada tela de la receta que llevó un corte: lo que pidió la receta, lo que quedó y a dónde fue. */
export const corteTelas = pgTable(
	"corte_telas",
	{
		id: uuid("id").primaryKey(),
		corteId: uuid("corte_id")
			.notNull()
			.references(() => cortes.id),
		materialId: uuid("material_id")
			.notNull()
			.references(() => materiales.id),
		papel: text("papel", { enum: papelesDeTela }).notNull(),
		metrosReceta: numeric("metros_receta", { precision: 12, scale: 3 }).notNull(),
		metrosQuedaron: numeric("metros_quedaron", { precision: 12, scale: 3 }).notNull(),
		quedaronCambiado: boolean("quedaron_cambiado").notNull(),
		destinoSobrante: text("destino_sobrante", { enum: ["ninguno", "rollo", "retazo", "merma"] }).notNull(),
		retazoId: uuid("retazo_id").references((): AnyPgColumn => retazos.id),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("corte_telas_material").on(tabla.corteId, tabla.materialId),
		uniqueIndex("corte_telas_principal").on(tabla.corteId).where(sql`${tabla.papel} = 'tela_principal'`),
		check("corte_telas_papel", sql`${tabla.papel} in (${valores(papelesDeTela)})`),
		check("corte_telas_receta", sql`${tabla.metrosReceta} > 0`),
		check("corte_telas_quedaron", sql`${tabla.metrosQuedaron} >= 0`),
		check("corte_telas_destino", sql`${tabla.destinoSobrante} in ('ninguno', 'rollo', 'retazo', 'merma')`),
		check("corte_telas_retazo", sql`(${tabla.destinoSobrante} = 'retazo') = (${tabla.retazoId} is not null)`),
	],
);

/** Los rollos de cada tela del corte, en el orden en que se usaron. */
export const corteRollos = pgTable(
	"corte_rollos",
	{
		id: uuid("id").primaryKey(),
		corteTelaId: uuid("corte_tela_id")
			.notNull()
			.references(() => corteTelas.id),
		rolloId: uuid("rollo_id")
			.notNull()
			.references((): AnyPgColumn => rollos.id),
		orden: smallint("orden").notNull(),
		esUltimo: boolean("es_ultimo").notNull(),
		apartadoRolloId: uuid("apartado_rollo_id").references((): AnyPgColumn => apartadosRollo.id),
		metrosAlCortar: numeric("metros_al_cortar", { precision: 12, scale: 3 }).notNull(),
		metrosUsados: numeric("metros_usados", { precision: 12, scale: 3 }).notNull(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("corte_rollos_rollo").on(tabla.rolloId, tabla.corteTelaId),
		uniqueIndex("corte_rollos_orden").on(tabla.corteTelaId, tabla.orden),
		uniqueIndex("corte_rollos_ultimo").on(tabla.corteTelaId).where(sql`${tabla.esUltimo}`),
		index("corte_rollos_de_rollo").on(tabla.rolloId),
		check("corte_rollos_al_cortar", sql`${tabla.metrosAlCortar} > 0`),
		check("corte_rollos_usados", sql`${tabla.metrosUsados} > 0 and ${tabla.metrosUsados} <= ${tabla.metrosAlCortar}`),
	],
);

/** El bulto B-: piezas de una talla de un lote que avanzan juntas por el taller. */
export const bultos = pgTable(
	"bultos",
	{
		id: uuid("id").primaryKey(),
		folio: text("folio").notNull(),
		loteId: uuid("lote_id")
			.notNull()
			.references(() => lotes.id),
		varianteId: uuid("variante_id")
			.notNull()
			.references(() => variantes.id),
		numero: smallint("numero").notNull(),
		piezas: integer("piezas").notNull(),
		...columnasComunes(),
		...columnaXidEscritura(),
	},
	(tabla) => [
		uniqueIndex("bultos_folio").on(sql`upper(${tabla.folio})`),
		uniqueIndex("bultos_numero").on(tabla.loteId, tabla.numero),
		index("bultos_lote_variante").on(tabla.loteId, tabla.varianteId),
		index("bultos_xid_escritura").on(tabla.xidEscritura),
		check("bultos_piezas", sql`${tabla.piezas} > 0`),
		check("bultos_numero_positivo", sql`${tabla.numero} > 0`),
	],
);

/** Lo que registra cada persona en la tablet, o lo que nace por bulto al cerrar el corte. */
export const registrosOperacion = pgTable(
	"registros_operacion",
	{
		id: uuid("id").primaryKey(),
		origen: text("origen", { enum: ["tablet", "corte"] })
			.notNull()
			.default("tablet"),
		corteId: uuid("corte_id").references(() => cortes.id),
		bultoId: uuid("bulto_id")
			.notNull()
			.references(() => bultos.id),
		loteId: uuid("lote_id")
			.notNull()
			.references(() => lotes.id),
		flujoOperacionId: uuid("flujo_operacion_id")
			.notNull()
			.references(() => flujoOperaciones.id),
		personaId: uuid("persona_id")
			.notNull()
			.references(() => personas.id),
		dispositivoId: uuid("dispositivo_id").references((): AnyPgColumn => dispositivos.id),
		piezasBuenas: integer("piezas_buenas").notNull(),
		piezasDanadas: integer("piezas_danadas").notNull(),
		tarifaCentavos: bigint("tarifa_centavos", { mode: "number" }),
		tarifaOperacionId: uuid("tarifa_operacion_id").references((): AnyPgColumn => tarifasOperacion.id),
		tarifaPuestaEn: momento("tarifa_puesta_en"),
		claveIdempotencia: uuid("clave_idempotencia").notNull(),
		hechoEn: momento("hecho_en").notNull(),
		fecha: date("fecha", { mode: "string" }).notNull(),
		recibidoEn: momento("recibido_en").notNull().defaultNow(),
		sinInternet: boolean("sin_internet").notNull(),
		excepcionId: uuid("excepcion_id").references((): AnyPgColumn => excepciones.id),
		estado: text("estado", { enum: ["vigente", "cancelado"] })
			.notNull()
			.default("vigente"),
		...columnasDeCancelacion(),
		...columnasComunes(),
		...columnaXidEscritura(),
	},
	(tabla) => [
		uniqueIndex("registros_operacion_clave").on(tabla.claveIdempotencia),
		index("registros_operacion_lote").on(tabla.loteId, tabla.flujoOperacionId).where(sql`${tabla.estado} = 'vigente'`),
		index("registros_operacion_bulto").on(tabla.bultoId, tabla.flujoOperacionId),
		index("registros_operacion_persona").on(tabla.personaId, tabla.fecha),
		index("registros_operacion_fecha").on(tabla.fecha),
		index("registros_operacion_sin_tarifa")
			.on(tabla.flujoOperacionId)
			.where(sql`${tabla.tarifaCentavos} is null and ${tabla.estado} = 'vigente'`),
		index("registros_operacion_xid_escritura").on(tabla.xidEscritura),
		check("registros_operacion_origen", sql`${tabla.origen} in ('tablet', 'corte')`),
		check("registros_operacion_corte", sql`(${tabla.origen} = 'corte') = (${tabla.corteId} is not null)`),
		check("registros_operacion_tablet", sql`${tabla.origen} <> 'tablet' or ${tabla.dispositivoId} is not null`),
		check(
			"registros_operacion_piezas",
			sql`${tabla.piezasBuenas} >= 0 and ${tabla.piezasDanadas} >= 0 and ${tabla.piezasBuenas} + ${tabla.piezasDanadas} > 0`,
		),
		check("registros_operacion_estado", sql`${tabla.estado} in ('vigente', 'cancelado')`),
		check("registros_operacion_cancelado", sql`(${tabla.estado} = 'cancelado') = (${tabla.canceladoEn} is not null)`),
	],
);

/** El estado de un cambio de pedido. */
export const estadosDeCambioPedido = ["por_aplicar", "aplicado", "reemplazado"] as const;

/** Lo que Producción ajusta cuando una versión del pedido deja piezas de más en producción. Uno por versión. */
export const cambiosPedido = pgTable(
	"cambios_pedido",
	{
		id: uuid("id").primaryKey(),
		pedidoId: uuid("pedido_id")
			.notNull()
			.references((): AnyPgColumn => pedidos.id),
		pedidoVersionId: uuid("pedido_version_id")
			.notNull()
			.references((): AnyPgColumn => pedidoVersiones.id),
		estado: text("estado").notNull().default("por_aplicar"),
		aplicadoEn: momento("aplicado_en"),
		aplicadoPor: uuid("aplicado_por").references((): AnyPgColumn => usuarios.id),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("cambios_pedido_version").on(tabla.pedidoVersionId),
		index("cambios_pedido_pedido").on(tabla.pedidoId, tabla.estado),
		check("cambios_pedido_estado", sql`${tabla.estado} in (${valores(estadosDeCambioPedido)})`),
		check("cambios_pedido_aplicado", sql`(${tabla.estado} = 'aplicado') = (${tabla.aplicadoEn} is not null)`),
	],
);

/** Lo que hizo cada aplicación de un cambio en cada lote y talla. */
export const cambioPedidoLineas = pgTable(
	"cambio_pedido_lineas",
	{
		id: uuid("id").primaryKey(),
		cambioPedidoId: uuid("cambio_pedido_id")
			.notNull()
			.references(() => cambiosPedido.id),
		loteId: uuid("lote_id")
			.notNull()
			.references(() => lotes.id),
		varianteId: uuid("variante_id")
			.notNull()
			.references(() => variantes.id),
		piezasRestadas: integer("piezas_restadas").notNull().default(0),
		piezasABodega: integer("piezas_a_bodega").notNull().default(0),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("cambio_pedido_lineas_unico").on(tabla.cambioPedidoId, tabla.loteId, tabla.varianteId),
		index("cambio_pedido_lineas_lote").on(tabla.loteId),
		check(
			"cambio_pedido_lineas_piezas",
			sql`${tabla.piezasRestadas} >= 0 and ${tabla.piezasABodega} >= 0 and ${tabla.piezasRestadas} + ${tabla.piezasABodega} > 0`,
		),
	],
);
