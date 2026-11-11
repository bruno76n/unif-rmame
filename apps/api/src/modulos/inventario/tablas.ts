/**
 * Las tablas del módulo `inventario`: las ubicaciones, el libro de movimientos y las existencias.
 * Fase 4 · docs/modulos/inventario/libro-de-movimientos.md («La tabla `ubicaciones`»)
 * Fase 9 · docs/modulos/inventario/libro-de-movimientos.md («La tabla `movimientos`», «La tabla
 * `movimiento_lineas`»), existencias-y-cuadre.md («La tabla `existencias`», «La tabla `existencias_material`») y
 * traspasos.md («La tabla `traspasos`», «La tabla `traspaso_lineas`»)
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
	pgView,
	smallint,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import {
	columnasComunes,
	columnasDeAparato,
	columnasDeBaja,
	columnasDeCancelacion,
	momento,
} from "../../nucleo/base/columnas.ts";
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
		traspasoId: uuid("traspaso_id").references((): AnyPgColumn => traspasos.id),
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

/** Los tipos de traspaso: qué lleva y de dónde a dónde (docs/modulos/inventario/traspasos.md, «Los tipos»). */
export const tiposDeTraspaso = [
	"solicitud_tienda",
	"reabasto",
	"pedido_linea",
	"surtido_pedido_externo",
	"lote_cliente",
	"lote_reabasto",
	"lote_temporada",
	"lote_pedido_especial",
	"quitado_de_pedido",
	"excedente_pedido",
	"reproceso",
	"material_proveedor",
	"nota_entrega",
	"devolucion_defecto",
	"sobrante_descontinuada",
	"traspaso_entre_tiendas",
	"pedido_de_bodega",
	"otro_de_tienda",
	"regresa",
	"devolucion_cliente_externo",
	"devolucion_linea",
	"devolucion_proveedor",
] as const;

/** El tipo de un traspaso. */
export type TipoDeTraspaso = (typeof tiposDeTraspaso)[number];

/** Los estados de un traspaso. */
export const estadosDeTraspaso = [
	"esperado",
	"en_camino_aduana",
	"en_aduana",
	"en_transito",
	"recibido",
	"con_diferencia",
	"salio",
	"repartido",
	"cancelado",
] as const;

/** El estado de un traspaso. */
export type EstadoDeTraspaso = (typeof estadosDeTraspaso)[number];

/** Los estados finales: el traspaso ya no cambia y lleva `terminado_en`. */
export const estadosFinalesDeTraspaso = ["recibido", "con_diferencia", "salio", "repartido", "cancelado"] as const;

/** Los tipos cuyo destino se decide en el camino («lo decide Calidad» o «lo decide Aduana»). */
export const tiposConDestinoPorDecidir = [
	"sobrante_descontinuada",
	"otro_de_tienda",
	"devolucion_defecto",
	"devolucion_cliente_externo",
	"devolucion_linea",
] as const;

/** El traspaso A-: lleva una partida de su origen a su destino pasando por aduana, con lo que dijo cada lado. */
export const traspasos = pgTable(
	"traspasos",
	{
		id: uuid("id").primaryKey(),
		folio: text("folio").notNull(),
		tipo: text("tipo").notNull(),
		origenUbicacionId: uuid("origen_ubicacion_id").references(() => ubicaciones.id),
		origenExterno: text("origen_externo"),
		destinoUbicacionId: uuid("destino_ubicacion_id").references(() => ubicaciones.id),
		destinoExterno: text("destino_externo"),
		estado: text("estado").notNull(),
		/** @llavePendiente solicitudes_tienda.id */
		solicitudTiendaId: uuid("solicitud_tienda_id"),
		/** @llavePendiente salidas_tienda.id */
		salidaTiendaId: uuid("salida_tienda_id"),
		/** @llavePendiente solicitudes_envio.id */
		solicitudEnvioId: uuid("solicitud_envio_id"),
		folioRb: text("folio_rb"),
		/** @llavePendiente pedidos.id */
		pedidoId: uuid("pedido_id"),
		/** @llavePendiente notas_entrega.id */
		notaEntregaId: uuid("nota_entrega_id"),
		/** @llavePendiente pedidos_especiales_tienda.id */
		pedidoEspecialTiendaId: uuid("pedido_especial_tienda_id"),
		/** @llavePendiente lotes.id */
		loteId: uuid("lote_id"),
		/** @llavePendiente reprocesos.id */
		reprocesoId: uuid("reproceso_id"),
		/** @llavePendiente ordenes_compra.id */
		ordenCompraId: uuid("orden_compra_id"),
		/** @llavePendiente devoluciones_linea.id */
		devolucionLineaId: uuid("devolucion_linea_id"),
		/** @llavePendiente notas_credito.id */
		notaCreditoId: uuid("nota_credito_id"),
		traspasoPadreId: uuid("traspaso_padre_id").references((): AnyPgColumn => traspasos.id),
		/** @llavePendiente recepciones.id */
		recepcionAduanaId: uuid("recepcion_aduana_id"),
		/** @llavePendiente despachos.id */
		despachoId: uuid("despacho_id"),
		/** @llavePendiente recepciones.id */
		recepcionDestinoId: uuid("recepcion_destino_id"),
		fechaSalidaEsperada: date("fecha_salida_esperada", { mode: "string" }),
		enviadoEn: momento("enviado_en"),
		llegoAduanaEn: momento("llego_aduana_en"),
		terminadoEn: momento("terminado_en"),
		etiquetasImpresasEn: momento("etiquetas_impresas_en"),
		nota: text("nota"),
		...columnasDeAparato(),
		claveIdempotencia: uuid("clave_idempotencia"),
		...columnasDeCancelacion(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("traspasos_folio").on(tabla.folio),
		uniqueIndex("traspasos_clave").on(tabla.claveIdempotencia).where(sql`${tabla.claveIdempotencia} is not null`),
		index("traspasos_abiertos")
			.on(tabla.estado)
			.where(sql`${tabla.estado} not in (${valores(estadosFinalesDeTraspaso)})`),
		index("traspasos_destino_estado").on(tabla.destinoUbicacionId, tabla.estado),
		index("traspasos_origen_estado").on(tabla.origenUbicacionId, tabla.estado),
		index("traspasos_despacho").on(tabla.despachoId),
		index("traspasos_pedido").on(tabla.pedidoId),
		index("traspasos_nota_entrega").on(tabla.notaEntregaId),
		index("traspasos_solicitud_tienda").on(tabla.solicitudTiendaId),
		index("traspasos_folio_rb").on(tabla.folioRb),
		index("traspasos_padre").on(tabla.traspasoPadreId),
		index("traspasos_version").on(tabla.version),
		check("traspasos_tipo", sql`${tabla.tipo} in (${valores(tiposDeTraspaso)})`),
		check("traspasos_estado", sql`${tabla.estado} in (${valores(estadosDeTraspaso)})`),
		check("traspasos_origen_externo", sql`${tabla.origenExterno} in ('proveedor', 'cliente_externo', 'cliente_linea')`),
		check(
			"traspasos_destino_externo",
			sql`${tabla.destinoExterno} in ('cliente_externo', 'cliente_linea', 'proveedor', 'merma')`,
		),
		// Un solo origen; `regresa` hereda el de su padre, y puede no tener uno propio.
		check(
			"traspasos_un_origen",
			sql`(${tabla.origenUbicacionId} is null) <> (${tabla.origenExterno} is null)
				or (${tabla.tipo} = 'regresa' and ${tabla.origenUbicacionId} is null and ${tabla.origenExterno} is null)`,
		),
		// A lo más un destino; ninguno solo mientras está en camino o en aduana y su destino se decide después.
		check(
			"traspasos_un_destino",
			sql`not (${tabla.destinoUbicacionId} is not null and ${tabla.destinoExterno} is not null)
				and (${tabla.destinoUbicacionId} is not null or ${tabla.destinoExterno} is not null
					or (${tabla.estado} in ('en_camino_aduana', 'en_aduana') and ${tabla.tipo} in (${valores(tiposConDestinoPorDecidir)})))`,
		),
		check(
			"traspasos_esperado",
			sql`${tabla.estado} <> 'esperado' or ${tabla.tipo} in ('devolucion_cliente_externo', 'devolucion_linea', 'devolucion_proveedor')`,
		),
		check(
			"traspasos_terminado",
			sql`(${tabla.estado} in (${valores(estadosFinalesDeTraspaso)})) = (${tabla.terminadoEn} is not null)`,
		),
		check(
			"traspasos_cancelado",
			sql`(${tabla.estado} = 'cancelado') = (${tabla.canceladoEn} is not null and ${tabla.motivoCancelacion} is not null)`,
		),
	],
);

/** Lo que lleva un traspaso, con lo que dijo cada lado: quien mandó, Aduana, lo repartido y el destino. */
export const traspasoLineas = pgTable(
	"traspaso_lineas",
	{
		id: uuid("id").primaryKey(),
		traspasoId: uuid("traspaso_id")
			.notNull()
			.references(() => traspasos.id),
		renglon: smallint("renglon").notNull(),
		varianteId: uuid("variante_id").references(() => variantes.id),
		/** @llavePendiente materiales.id */
		materialId: uuid("material_id"),
		/** @llavePendiente rollos.id */
		rolloId: uuid("rollo_id"),
		/** @llavePendiente lotes.id */
		loteId: uuid("lote_id"),
		piezasEnviadas: integer("piezas_enviadas"),
		piezasRecibidasAduana: integer("piezas_recibidas_aduana"),
		piezasRepartidas: integer("piezas_repartidas").notNull().default(0),
		piezasRecibidasDestino: integer("piezas_recibidas_destino"),
		cantidadEnviada: numeric("cantidad_enviada", { precision: 12, scale: 3 }),
		cantidadRecibidaAduana: numeric("cantidad_recibida_aduana", { precision: 12, scale: 3 }),
		cantidadRepartida: numeric("cantidad_repartida", { precision: 12, scale: 3 }).notNull().default("0"),
		cantidadRecibidaDestino: numeric("cantidad_recibida_destino", { precision: 12, scale: 3 }),
		/** @llavePendiente defectos.id */
		defectoId: uuid("defecto_id"),
		/** @llavePendiente pedidos_linea.id */
		pedidoLineaId: uuid("pedido_linea_id"),
		nota: text("nota"),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("traspaso_lineas_renglon").on(tabla.traspasoId, tabla.renglon),
		index("traspaso_lineas_variante").on(tabla.varianteId),
		index("traspaso_lineas_pedido_linea").on(tabla.pedidoLineaId),
		// O prenda (variante y sus piezas) o material (material y sus cantidades); lo repartido del otro, en cero.
		check(
			"traspaso_lineas_forma",
			sql`(${tabla.varianteId} is not null and ${tabla.materialId} is null and ${tabla.rolloId} is null
					and ${tabla.cantidadEnviada} is null and ${tabla.cantidadRecibidaAduana} is null
					and ${tabla.cantidadRecibidaDestino} is null and ${tabla.cantidadRepartida} = 0)
				or (${tabla.materialId} is not null and ${tabla.varianteId} is null
					and ${tabla.piezasEnviadas} is null and ${tabla.piezasRecibidasAduana} is null
					and ${tabla.piezasRecibidasDestino} is null and ${tabla.piezasRepartidas} = 0)`,
		),
		check(
			"traspaso_lineas_no_negativas",
			sql`coalesce(${tabla.piezasEnviadas}, 0) >= 0 and coalesce(${tabla.piezasRecibidasAduana}, 0) >= 0
				and ${tabla.piezasRepartidas} >= 0 and coalesce(${tabla.piezasRecibidasDestino}, 0) >= 0
				and coalesce(${tabla.cantidadEnviada}, 0) >= 0 and coalesce(${tabla.cantidadRecibidaAduana}, 0) >= 0
				and ${tabla.cantidadRepartida} >= 0 and coalesce(${tabla.cantidadRecibidaDestino}, 0) >= 0`,
		),
	],
);

/**
 * Una partida en aduana: por renglón de un traspaso `en_aduana`, lo que queda (recibido − repartido), sus horas en
 * aduana, su color y si sale hoy o mañana. Es una vista (migración `0027`), para que nadie la escriba dos veces.
 */
export const partidasAduana = pgView("partidas_aduana", {
	traspasoId: uuid("traspaso_id").notNull(),
	folio: text("folio").notNull(),
	tipo: text("tipo").notNull(),
	origenUbicacionId: uuid("origen_ubicacion_id"),
	origenExterno: text("origen_externo"),
	destinoUbicacionId: uuid("destino_ubicacion_id"),
	destinoExterno: text("destino_externo"),
	lineaId: uuid("linea_id").notNull(),
	renglon: smallint("renglon").notNull(),
	varianteId: uuid("variante_id"),
	materialId: uuid("material_id"),
	rolloId: uuid("rollo_id"),
	loteId: uuid("lote_id"),
	piezas: integer("piezas"),
	cantidad: numeric("cantidad", { precision: 12, scale: 3 }),
	llegoAduanaEn: momento("llego_aduana_en"),
	horasEnAduana: numeric("horas_en_aduana"),
	color: text("color").notNull(),
	fechaSalidaEsperada: date("fecha_salida_esperada", { mode: "string" }),
	sale: text("sale"),
}).existing();
