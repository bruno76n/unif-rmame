/**
 * Las tablas de `contaduria`: los terceros (fase 10, porque un proveedor no tiene nombre sin su tercero), el crédito de
 * cada cliente, sus cuentas por cobrar, los pagos con sus aplicaciones, el libro del saldo a favor y el de los anticipos.
 * Fase 10 · docs/modulos/contaduria/terceros-y-deudas.md («La tabla `terceros`»)
 * Fase 15 · docs/modulos/contaduria/credito-de-clientes.md («La tabla `credito_clientes`») y
 * docs/modulos/contaduria/cuentas-por-cobrar.md («La tabla `cuentas_por_cobrar`») y
 * docs/modulos/contaduria/pagos-y-saldo-a-favor.md (las tres tablas) y docs/modulos/contaduria/anticipos.md
 * Fase 17 · docs/modulos/contaduria/facturas-de-proveedor.md (las dos tablas), cuentas-por-pagar.md («La tabla
 * `cuentas_por_pagar`»), terceros-y-deudas.md (`compensaciones`, `deudas` y `deuda_mensualidades`), gastos.md («La
 * tabla `gastos`») y nomina.md (las cuatro tablas)
 *
 * Las columnas que apuntan a los clientes, los pedidos y las notas son llaves a las tablas de Ventas; las de las
 * facturas, a los proveedores y las órdenes de Compras.
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
	text,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { columnasComunes, columnasDeAparato, momento, valores } from "../../nucleo/base/columnas.ts";
import { archivos, listaValores, usuarios } from "../admin/tablas.ts";
import { ordenesCompra, proveedores } from "../compras/tablas.ts";
import { autorizaciones } from "../direccion/tablas.ts";
import { ubicaciones } from "../inventario/tablas.ts";
import { maquinas, servicios } from "../mantenimiento/tablas.ts";
import { asistenciaSemanas, personas } from "../personal/tablas.ts";
import { flujoOperaciones, registrosOperacion } from "../produccion/tablas.ts";
import { clientes, notasCredito, notasEntrega, pedidos } from "../ventas/tablas.ts";

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

/** El semáforo de crédito de un cliente: lo pone Contaduría a mano. */
export const semaforosDeCredito = ["al_corriente", "cerca_del_limite", "detenido"] as const;

/** El crédito de cada cliente: su límite, sus días y su semáforo. Su renglón es el candado del dinero del cliente. */
export const creditoClientes = pgTable(
	"credito_clientes",
	{
		id: uuid("id").primaryKey(),
		clienteId: uuid("cliente_id")
			.references((): AnyPgColumn => clientes.id)
			.notNull(),
		terceroId: uuid("tercero_id")
			.notNull()
			.references(() => terceros.id),
		limiteCentavos: bigint("limite_centavos", { mode: "number" }).notNull().default(0),
		diasCredito: integer("dias_credito").notNull(),
		semaforo: text("semaforo").notNull().default("al_corriente"),
		semaforoCambiadoEn: momento("semaforo_cambiado_en"),
		semaforoCambiadoPor: uuid("semaforo_cambiado_por").references(() => usuarios.id),
		limiteCambiadoEn: momento("limite_cambiado_en"),
		limiteCambiadoPor: uuid("limite_cambiado_por").references(() => usuarios.id),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("credito_clientes_cliente").on(tabla.clienteId),
		index("credito_clientes_tercero").on(tabla.terceroId),
		index("credito_clientes_semaforo").on(tabla.semaforo).where(sql`${tabla.semaforo} <> 'al_corriente'`),
		check("credito_clientes_limite", sql`${tabla.limiteCentavos} >= 0 and ${tabla.limiteCentavos} % 100 = 0`),
		check("credito_clientes_dias", sql`${tabla.diasCredito} > 0`),
		check("credito_clientes_semaforo", sql`${tabla.semaforo} in (${valores(semaforosDeCredito)})`),
	],
);

/** El estado de pago de una cuenta por cobrar. */
export const estadosDeCuentaPorCobrar = ["sin_pagar", "pagada_en_parte", "pagada"] as const;

/** Lo que nos debe un cliente por cada nota entregada. El saldo se guarda y cambia con cada aplicación. */
export const cuentasPorCobrar = pgTable(
	"cuentas_por_cobrar",
	{
		id: uuid("id").primaryKey(),
		notaEntregaId: uuid("nota_entrega_id")
			.references((): AnyPgColumn => notasEntrega.id)
			.notNull(),
		pedidoId: uuid("pedido_id")
			.references((): AnyPgColumn => pedidos.id)
			.notNull(),
		clienteId: uuid("cliente_id")
			.references((): AnyPgColumn => clientes.id)
			.notNull(),
		terceroId: uuid("tercero_id")
			.notNull()
			.references(() => terceros.id),
		fechaEntrega: date("fecha_entrega", { mode: "string" }).notNull(),
		diasCredito: integer("dias_credito").notNull(),
		vence: date("vence", { mode: "string" }).notNull(),
		totalNotaCentavos: bigint("total_nota_centavos", { mode: "number" }).notNull(),
		anticipoAplicadoCentavos: bigint("anticipo_aplicado_centavos", { mode: "number" }).notNull().default(0),
		importeCentavos: bigint("importe_centavos", { mode: "number" }).notNull(),
		saldoCentavos: bigint("saldo_centavos", { mode: "number" }).notNull(),
		estado: text("estado").notNull(),
		pagadaEn: momento("pagada_en"),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("cuentas_por_cobrar_nota").on(tabla.notaEntregaId),
		index("cuentas_por_cobrar_cliente").on(tabla.clienteId, tabla.estado),
		index("cuentas_por_cobrar_tercero").on(tabla.terceroId),
		index("cuentas_por_cobrar_vence").on(tabla.vence).where(sql`${tabla.estado} <> 'pagada'`),
		check("cuentas_por_cobrar_dias", sql`${tabla.diasCredito} >= 0`),
		check("cuentas_por_cobrar_vence", sql`${tabla.vence} = ${tabla.fechaEntrega} + ${tabla.diasCredito}`),
		check(
			"cuentas_por_cobrar_importe",
			sql`${tabla.anticipoAplicadoCentavos} >= 0 and ${tabla.importeCentavos} >= 0
				and ${tabla.importeCentavos} = ${tabla.totalNotaCentavos} - ${tabla.anticipoAplicadoCentavos}`,
		),
		check("cuentas_por_cobrar_saldo", sql`${tabla.saldoCentavos} between 0 and ${tabla.importeCentavos}`),
		check("cuentas_por_cobrar_estado", sql`${tabla.estado} in (${valores(estadosDeCuentaPorCobrar)})`),
		check(
			"cuentas_por_cobrar_pagada",
			sql`(${tabla.estado} = 'pagada') = (${tabla.saldoCentavos} = 0)
				and (${tabla.estado} = 'pagada') = (${tabla.pagadaEn} is not null)
				and (${tabla.estado} <> 'sin_pagar' or ${tabla.saldoCentavos} = ${tabla.importeCentavos})
				and (${tabla.estado} <> 'pagada_en_parte' or ${tabla.saldoCentavos} < ${tabla.importeCentavos})`,
		),
	],
);

/** Las columnas de quien cancela: cuándo, quién y por qué. */
function columnasDeCancelacion() {
	return {
		canceladoEn: momento("cancelado_en"),
		canceladoPor: uuid("cancelado_por").references(() => usuarios.id),
		motivoCancelacion: text("motivo_cancelacion"),
	};
}

/** Lo que entra (`recibido`) y lo que sale (`emitido`): un solo contador PG-. */
export const direccionesDePago = ["recibido", "emitido"] as const;

/** A qué va un pago. */
export const conceptosDePago = ["nota", "pedido", "cuenta_por_pagar", "devolucion_saldo_favor"] as const;

/** Dónde se recibió o de dónde salió el dinero. */
export const mediosDePago = ["efectivo", "cuenta_fabrica", "cuenta_tercero"] as const;

/** Un pago que entra o sale, con su folio PG-. */
export const pagos = pgTable(
	"pagos",
	{
		id: uuid("id").primaryKey(),
		folio: text("folio").notNull(),
		direccion: text("direccion").notNull(),
		concepto: text("concepto").notNull(),
		fecha: date("fecha", { mode: "string" }).notNull(),
		terceroId: uuid("tercero_id")
			.notNull()
			.references(() => terceros.id),
		clienteId: uuid("cliente_id").references((): AnyPgColumn => clientes.id),
		notaEntregaId: uuid("nota_entrega_id").references((): AnyPgColumn => notasEntrega.id),
		pedidoId: uuid("pedido_id").references((): AnyPgColumn => pedidos.id),
		montoCentavos: bigint("monto_centavos", { mode: "number" }).notNull(),
		medio: text("medio").notNull(),
		cuentaFabricaId: uuid("cuenta_fabrica_id").references(() => listaValores.id),
		terceroDepositoId: uuid("tercero_deposito_id").references(() => terceros.id),
		referencia: text("referencia"),
		confirmadoConGoogleEn: momento("confirmado_con_google_en"),
		estado: text("estado").notNull().default("registrado"),
		...columnasDeCancelacion(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("pagos_folio").on(tabla.folio),
		index("pagos_cliente").on(tabla.clienteId, tabla.fecha),
		index("pagos_tercero").on(tabla.terceroId),
		index("pagos_tercero_deposito").on(tabla.terceroDepositoId),
		index("pagos_nota").on(tabla.notaEntregaId),
		index("pagos_pedido").on(tabla.pedidoId),
		index("pagos_referencia").on(tabla.referencia, tabla.montoCentavos),
		check("pagos_direccion", sql`${tabla.direccion} in (${valores(direccionesDePago)})`),
		check(
			"pagos_concepto",
			sql`(${tabla.direccion} = 'recibido' and ${tabla.concepto} in ('nota', 'pedido'))
				or (${tabla.direccion} = 'emitido' and ${tabla.concepto} in ('cuenta_por_pagar', 'devolucion_saldo_favor'))`,
		),
		check(
			"pagos_cliente",
			sql`(${tabla.clienteId} is not null) = (${tabla.direccion} = 'recibido' or ${tabla.concepto} = 'devolucion_saldo_favor')`,
		),
		check(
			"pagos_documento",
			sql`(${tabla.notaEntregaId} is not null) = (${tabla.concepto} = 'nota')
				and (${tabla.pedidoId} is not null) = (${tabla.concepto} = 'pedido')`,
		),
		// En pesos enteros; con centavos solo un pago a una nota, a una cuenta por pagar o una devolución, cuando liquidan
		// exacto lo que queda (la acción revisa que sea exacto, decisiones 674 y 697).
		check(
			"pagos_monto",
			sql`${tabla.montoCentavos} > 0
				and (${tabla.montoCentavos} % 100 = 0
					or ${tabla.concepto} in ('nota', 'cuenta_por_pagar', 'devolucion_saldo_favor'))`,
		),
		check(
			"pagos_medio",
			sql`${tabla.medio} in (${valores(mediosDePago)})
				and (${tabla.medio} <> 'cuenta_tercero' or ${tabla.direccion} = 'recibido')`,
		),
		check("pagos_cuenta_fabrica", sql`(${tabla.cuentaFabricaId} is not null) = (${tabla.medio} = 'cuenta_fabrica')`),
		check(
			"pagos_tercero_deposito",
			sql`(${tabla.terceroDepositoId} is not null) = (${tabla.medio} = 'cuenta_tercero')
				and ${tabla.terceroDepositoId} is distinct from ${tabla.terceroId}`,
		),
		check(
			"pagos_referencia",
			sql`char_length(${tabla.referencia}) between 3 and 30
				and (${tabla.referencia} is not null or (${tabla.medio} = 'efectivo' and ${tabla.direccion} = 'recibido'))`,
		),
		check("pagos_confirmado", sql`(${tabla.confirmadoConGoogleEn} is not null) = (${tabla.direccion} = 'emitido')`),
		check("pagos_estado", sql`${tabla.estado} in ('registrado', 'cancelado')`),
		check(
			"pagos_cancelado",
			sql`(${tabla.estado} = 'cancelado') = (${tabla.canceladoEn} is not null and ${tabla.motivoCancelacion} is not null)`,
		),
	],
);

/** El libro del saldo a favor de cada cliente: lo que entra, lo aplicado y lo devuelto. */
export const tiposDeSaldoFavor = ["entra", "aplicado_nota", "aplicado_pedido", "devuelto"] as const;

/** De dónde entra el saldo a favor. */
export const origenesDeSaldoFavor = ["anticipo_pedido", "nota_credito"] as const;

/** El libro del saldo a favor de cada cliente. Sus renglones nunca cambian, salvo para cancelarse. */
export const saldoFavorMovimientos = pgTable(
	"saldo_favor_movimientos",
	{
		id: uuid("id").primaryKey(),
		clienteId: uuid("cliente_id")
			.references((): AnyPgColumn => clientes.id)
			.notNull(),
		terceroId: uuid("tercero_id")
			.notNull()
			.references(() => terceros.id),
		tipo: text("tipo").notNull(),
		origen: text("origen"),
		montoCentavos: bigint("monto_centavos", { mode: "number" }).notNull(),
		fecha: date("fecha", { mode: "string" }).notNull(),
		pedidoId: uuid("pedido_id").references((): AnyPgColumn => pedidos.id),
		notaCreditoId: uuid("nota_credito_id").references((): AnyPgColumn => notasCredito.id),
		cuentaPorCobrarId: uuid("cuenta_por_cobrar_id").references(() => cuentasPorCobrar.id),
		pagoId: uuid("pago_id").references(() => pagos.id),
		estado: text("estado").notNull().default("vigente"),
		...columnasDeCancelacion(),
		...columnasComunes(),
	},
	(tabla) => [
		index("saldo_favor_movimientos_cliente").on(tabla.clienteId, tabla.estado),
		index("saldo_favor_movimientos_pago").on(tabla.pagoId),
		uniqueIndex("saldo_favor_movimientos_nota_credito").on(tabla.notaCreditoId).where(sql`${tabla.tipo} = 'entra'`),
		check("saldo_favor_movimientos_tipo", sql`${tabla.tipo} in (${valores(tiposDeSaldoFavor)})`),
		check(
			"saldo_favor_movimientos_origen",
			sql`(${tabla.origen} is not null) = (${tabla.tipo} = 'entra')
				and (${tabla.origen} is null or ${tabla.origen} in (${valores(origenesDeSaldoFavor)}))`,
		),
		check(
			"saldo_favor_movimientos_documento",
			sql`(coalesce(${tabla.origen}, '') <> 'anticipo_pedido' or ${tabla.pedidoId} is not null)
				and (coalesce(${tabla.origen}, '') = 'nota_credito') = (${tabla.notaCreditoId} is not null)
				and (${tabla.tipo} = 'aplicado_nota') = (${tabla.cuentaPorCobrarId} is not null)
				and (${tabla.tipo} <> 'aplicado_pedido' or ${tabla.pedidoId} is not null)
				and (${tabla.tipo} = 'devuelto') = (${tabla.pagoId} is not null)`,
		),
		check("saldo_favor_movimientos_monto", sql`${tabla.montoCentavos} > 0`),
		check("saldo_favor_movimientos_estado", sql`${tabla.estado} in ('vigente', 'cancelado')`),
		check(
			"saldo_favor_movimientos_cancelado",
			sql`(${tabla.estado} = 'cancelado') = (${tabla.canceladoEn} is not null and ${tabla.motivoCancelacion} is not null)`,
		),
	],
);

/** Qué saldo baja cada pago, compensación, nota de crédito o saldo a favor, y por cuánto. */
export const aplicacionesPago = pgTable(
	"aplicaciones_pago",
	{
		id: uuid("id").primaryKey(),
		pagoId: uuid("pago_id").references(() => pagos.id),
		compensacionId: uuid("compensacion_id").references((): AnyPgColumn => compensaciones.id),
		notaCreditoId: uuid("nota_credito_id").references((): AnyPgColumn => notasCredito.id),
		saldoFavorMovimientoId: uuid("saldo_favor_movimiento_id").references((): AnyPgColumn => saldoFavorMovimientos.id),
		cuentaPorCobrarId: uuid("cuenta_por_cobrar_id").references(() => cuentasPorCobrar.id),
		cuentaPorPagarId: uuid("cuenta_por_pagar_id").references((): AnyPgColumn => cuentasPorPagar.id),
		montoCentavos: bigint("monto_centavos", { mode: "number" }).notNull(),
		fecha: date("fecha", { mode: "string" }).notNull(),
		estado: text("estado").notNull().default("vigente"),
		...columnasDeCancelacion(),
		...columnasComunes(),
	},
	(tabla) => [
		index("aplicaciones_pago_pago").on(tabla.pagoId),
		index("aplicaciones_pago_cuenta_por_cobrar").on(tabla.cuentaPorCobrarId),
		index("aplicaciones_pago_cuenta_por_pagar").on(tabla.cuentaPorPagarId),
		index("aplicaciones_pago_compensacion").on(tabla.compensacionId),
		uniqueIndex("aplicaciones_pago_nota_credito").on(tabla.notaCreditoId),
		check(
			"aplicaciones_pago_origen",
			sql`num_nonnulls(${tabla.pagoId}, ${tabla.compensacionId}, ${tabla.notaCreditoId}, ${tabla.saldoFavorMovimientoId}) = 1`,
		),
		check("aplicaciones_pago_destino", sql`num_nonnulls(${tabla.cuentaPorCobrarId}, ${tabla.cuentaPorPagarId}) = 1`),
		check("aplicaciones_pago_monto", sql`${tabla.montoCentavos} > 0`),
		check("aplicaciones_pago_estado", sql`${tabla.estado} in ('vigente', 'cancelada')`),
		check(
			"aplicaciones_pago_cancelada",
			sql`(${tabla.estado} = 'cancelada') = (${tabla.canceladoEn} is not null and ${tabla.motivoCancelacion} is not null)`,
		),
	],
);

/** Los renglones del libro de anticipos: `recibido` y `regresado` suman; `aplicado` y `a_favor` restan. */
export const tiposDeAnticipo = ["recibido", "aplicado", "regresado", "a_favor"] as const;

/** El libro de los anticipos de cada pedido. Solo crece: un renglón solo se cancela con lo que lo originó. */
export const anticipos = pgTable(
	"anticipos",
	{
		id: uuid("id").primaryKey(),
		pedidoId: uuid("pedido_id")
			.references((): AnyPgColumn => pedidos.id)
			.notNull(),
		clienteId: uuid("cliente_id")
			.references((): AnyPgColumn => clientes.id)
			.notNull(),
		tipo: text("tipo").notNull(),
		montoCentavos: bigint("monto_centavos", { mode: "number" }).notNull(),
		fecha: date("fecha", { mode: "string" }).notNull(),
		pagoId: uuid("pago_id").references(() => pagos.id),
		saldoFavorMovimientoId: uuid("saldo_favor_movimiento_id").references(() => saldoFavorMovimientos.id),
		notaEntregaId: uuid("nota_entrega_id").references((): AnyPgColumn => notasEntrega.id),
		anticipoAplicadoId: uuid("anticipo_aplicado_id").references((): AnyPgColumn => anticipos.id),
		estado: text("estado").notNull().default("vigente"),
		...columnasDeCancelacion(),
		...columnasComunes(),
	},
	(tabla) => [
		index("anticipos_pedido").on(tabla.pedidoId, tabla.estado),
		index("anticipos_nota").on(tabla.notaEntregaId),
		index("anticipos_pago").on(tabla.pagoId),
		uniqueIndex("anticipos_aplicado").on(tabla.anticipoAplicadoId).where(sql`${tabla.estado} = 'vigente'`),
		check("anticipos_tipo", sql`${tabla.tipo} in (${valores(tiposDeAnticipo)})`),
		check("anticipos_monto", sql`${tabla.montoCentavos} > 0`),
		check(
			"anticipos_origen",
			sql`num_nonnulls(${tabla.pagoId}, ${tabla.saldoFavorMovimientoId}) = case when ${tabla.tipo} = 'recibido' then 1 else 0 end`,
		),
		check(
			"anticipos_nota",
			sql`(${tabla.notaEntregaId} is not null) = (${tabla.tipo} in ('aplicado', 'regresado'))
				and (${tabla.anticipoAplicadoId} is not null) = (${tabla.tipo} = 'regresado')`,
		),
		check("anticipos_estado", sql`${tabla.estado} in ('vigente', 'cancelado')`),
		check(
			"anticipos_cancelado",
			sql`(${tabla.estado} = 'cancelado') = (${tabla.canceladoEn} is not null and ${tabla.motivoCancelacion} is not null)`,
		),
	],
);

/** Los estados de una factura de proveedor. */
export const estadosDeFacturaProveedor = [
	"detenida",
	"esperando_autorizacion",
	"conciliada",
	"autorizada",
	"cancelada",
] as const;

/** Un estado de una factura de proveedor. */
export type EstadoDeFacturaProveedor = (typeof estadosDeFacturaProveedor)[number];

/** A cargo de quién está una factura detenida. */
export const responsablesDeDetencion = ["aduana", "contaduria"] as const;

/** La factura o nota FP- de un proveedor, tal como llegó, con sus tres puntas. */
export const facturasProveedor = pgTable(
	"facturas_proveedor",
	{
		id: uuid("id").primaryKey(),
		folio: text("folio").notNull(),
		/** El de su factura, en mayúsculas. */
		folioProveedor: text("folio_proveedor").notNull(),
		uuidCfdi: text("uuid_cfdi"),
		proveedorId: uuid("proveedor_id")
			.notNull()
			.references((): AnyPgColumn => proveedores.id),
		terceroId: uuid("tercero_id")
			.notNull()
			.references(() => terceros.id),
		fechaCaptura: date("fecha_captura", { mode: "string" }).notNull(),
		fechaFactura: date("fecha_factura", { mode: "string" }),
		subtotalCentavos: bigint("subtotal_centavos", { mode: "number" }).notNull(),
		ivaCentavos: bigint("iva_centavos", { mode: "number" }).notNull(),
		totalFacturadoCentavos: bigint("total_facturado_centavos", { mode: "number" }).notNull(),
		/** La suma de sus órdenes en la última revisión. */
		valorRecibidoCentavos: bigint("valor_recibido_centavos", { mode: "number" }).notNull(),
		estado: text("estado").notNull(),
		motivoDetencion: text("motivo_detencion"),
		responsableDetencion: text("responsable_detencion"),
		/** La última «Pago fuera de lo normal». */
		autorizacionId: uuid("autorizacion_id").references((): AnyPgColumn => autorizaciones.id),
		montoAutorizadoCentavos: bigint("monto_autorizado_centavos", { mode: "number" }),
		diferenciaPorAclararCentavos: bigint("diferencia_por_aclarar_centavos", { mode: "number" }),
		notaCreditoProveedor: text("nota_credito_proveedor"),
		diferenciaAclaradaEn: momento("diferencia_aclarada_en"),
		diferenciaAclaradaPor: uuid("diferencia_aclarada_por").references(() => usuarios.id),
		diferenciaAclaradaArchivoId: uuid("diferencia_aclarada_archivo_id").references(() => archivos.id),
		archivoXmlId: uuid("archivo_xml_id").references(() => archivos.id),
		archivoPdfId: uuid("archivo_pdf_id").references(() => archivos.id),
		...columnasDeCancelacion(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("facturas_proveedor_folio").on(tabla.folio),
		uniqueIndex("facturas_proveedor_folio_proveedor")
			.on(tabla.proveedorId, tabla.folioProveedor)
			.where(sql`${tabla.estado} <> 'cancelada'`),
		uniqueIndex("facturas_proveedor_uuid_cfdi").on(tabla.uuidCfdi).where(sql`${tabla.uuidCfdi} is not null`),
		index("facturas_proveedor_estado").on(tabla.estado),
		check(
			"facturas_proveedor_folio_proveedor",
			sql`char_length(${tabla.folioProveedor}) between 3 and 12 and ${tabla.folioProveedor} = upper(${tabla.folioProveedor})`,
		),
		check(
			"facturas_proveedor_importes",
			sql`${tabla.subtotalCentavos} > 0 and ${tabla.ivaCentavos} >= 0
				and ${tabla.subtotalCentavos} + ${tabla.ivaCentavos} = ${tabla.totalFacturadoCentavos}
				and ${tabla.valorRecibidoCentavos} >= 0`,
		),
		check("facturas_proveedor_fecha", sql`${tabla.fechaFactura} <= ${tabla.fechaCaptura}`),
		check("facturas_proveedor_estado", sql`${tabla.estado} in (${valores(estadosDeFacturaProveedor)})`),
		check(
			"facturas_proveedor_detenida",
			sql`${tabla.responsableDetencion} in (${valores(responsablesDeDetencion)})
				and (${tabla.estado} not in ('detenida', 'esperando_autorizacion')
					or (${tabla.motivoDetencion} is not null and ${tabla.responsableDetencion} is not null))
				and (${tabla.estado} <> 'esperando_autorizacion' or ${tabla.autorizacionId} is not null)`,
		),
		check(
			"facturas_proveedor_autorizada",
			sql`(${tabla.estado} <> 'autorizada'
					or (${tabla.montoAutorizadoCentavos} is not null and ${tabla.diferenciaPorAclararCentavos} is not null))
				and ${tabla.montoAutorizadoCentavos} between 1 and ${tabla.totalFacturadoCentavos}
				and ${tabla.diferenciaPorAclararCentavos} = ${tabla.totalFacturadoCentavos} - ${tabla.montoAutorizadoCentavos}`,
		),
		check(
			"facturas_proveedor_aclarada",
			sql`(${tabla.notaCreditoProveedor} is null) = (${tabla.diferenciaAclaradaEn} is null)
				and (${tabla.notaCreditoProveedor} is null or ${tabla.estado} = 'autorizada')`,
		),
		check(
			"facturas_proveedor_cancelada",
			sql`(${tabla.estado} = 'cancelada') = (${tabla.canceladoEn} is not null and ${tabla.motivoCancelacion} is not null)`,
		),
	],
);

/** Lo que toca a cada orden de una factura de proveedor, sin IVA, y su valor recibido en la última revisión. */
export const facturaProveedorOrdenes = pgTable(
	"factura_proveedor_ordenes",
	{
		id: uuid("id").primaryKey(),
		facturaProveedorId: uuid("factura_proveedor_id")
			.notNull()
			.references(() => facturasProveedor.id),
		ordenCompraId: uuid("orden_compra_id")
			.notNull()
			.references((): AnyPgColumn => ordenesCompra.id),
		importeFacturadoCentavos: bigint("importe_facturado_centavos", { mode: "number" }).notNull(),
		valorRecibidoCentavos: bigint("valor_recibido_centavos", { mode: "number" }).notNull(),
		/** Si de esta orden no había llegado nada. */
		sinRecepcion: boolean("sin_recepcion").notNull(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("factura_proveedor_ordenes_orden").on(tabla.facturaProveedorId, tabla.ordenCompraId),
		index("factura_proveedor_ordenes_orden_compra").on(tabla.ordenCompraId),
		check(
			"factura_proveedor_ordenes_importes",
			sql`${tabla.importeFacturadoCentavos} > 0 and ${tabla.valorRecibidoCentavos} >= 0`,
		),
	],
);

/** Los estados de una cuenta por pagar. */
export const estadosDeCuentaPorPagar = ["detenida", "por_pagar", "pagada_en_parte", "pagada", "cancelada"] as const;

/** Un estado de una cuenta por pagar. */
export type EstadoDeCuentaPorPagar = (typeof estadosDeCuentaPorPagar)[number];

/** Lo que la fábrica le debe a un proveedor por cada factura y a un acreedor por cada mensualidad. */
export const cuentasPorPagar = pgTable(
	"cuentas_por_pagar",
	{
		id: uuid("id").primaryKey(),
		terceroId: uuid("tercero_id")
			.notNull()
			.references(() => terceros.id),
		tipo: text("tipo").notNull(),
		facturaProveedorId: uuid("factura_proveedor_id").references(() => facturasProveedor.id),
		deudaMensualidadId: uuid("deuda_mensualidad_id").references((): AnyPgColumn => deudaMensualidades.id),
		/** El día en que nació. */
		fecha: date("fecha", { mode: "string" }).notNull(),
		vence: date("vence", { mode: "string" }).notNull(),
		importeCentavos: bigint("importe_centavos", { mode: "number" }).notNull(),
		saldoCentavos: bigint("saldo_centavos", { mode: "number" }).notNull(),
		estado: text("estado").notNull(),
		pagadaEn: momento("pagada_en"),
		...columnasDeCancelacion(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("cuentas_por_pagar_factura")
			.on(tabla.facturaProveedorId)
			.where(sql`${tabla.facturaProveedorId} is not null`),
		uniqueIndex("cuentas_por_pagar_mensualidad")
			.on(tabla.deudaMensualidadId)
			.where(sql`${tabla.deudaMensualidadId} is not null`),
		index("cuentas_por_pagar_tercero").on(tabla.terceroId, tabla.estado),
		index("cuentas_por_pagar_vence").on(tabla.vence).where(sql`${tabla.estado} not in ('pagada', 'cancelada')`),
		check("cuentas_por_pagar_tipo", sql`${tabla.tipo} in ('proveedor', 'acreedor')`),
		check(
			"cuentas_por_pagar_documento",
			sql`(${tabla.facturaProveedorId} is not null) = (${tabla.tipo} = 'proveedor')
				and (${tabla.deudaMensualidadId} is not null) = (${tabla.tipo} = 'acreedor')`,
		),
		check("cuentas_por_pagar_importe", sql`${tabla.importeCentavos} > 0`),
		check("cuentas_por_pagar_saldo", sql`${tabla.saldoCentavos} between 0 and ${tabla.importeCentavos}`),
		check("cuentas_por_pagar_estado", sql`${tabla.estado} in (${valores(estadosDeCuentaPorPagar)})`),
		check(
			"cuentas_por_pagar_pagada",
			sql`(${tabla.estado} = 'pagada') = (${tabla.saldoCentavos} = 0)
				and (${tabla.estado} = 'pagada') = (${tabla.pagadaEn} is not null)
				and (${tabla.estado} not in ('detenida', 'por_pagar', 'cancelada')
					or ${tabla.saldoCentavos} = ${tabla.importeCentavos})
				and (${tabla.estado} <> 'pagada_en_parte' or ${tabla.saldoCentavos} < ${tabla.importeCentavos})`,
		),
		check(
			"cuentas_por_pagar_cancelada",
			sql`(${tabla.estado} = 'cancelada') = (${tabla.canceladoEn} is not null and ${tabla.motivoCancelacion} is not null)`,
		),
	],
);

/** Una compensación: lo que un tercero nos compró se descuenta de lo que le debemos, sin mover dinero. */
export const compensaciones = pgTable(
	"compensaciones",
	{
		id: uuid("id").primaryKey(),
		terceroId: uuid("tercero_id")
			.notNull()
			.references(() => terceros.id),
		fecha: date("fecha", { mode: "string" }).notNull(),
		montoCentavos: bigint("monto_centavos", { mode: "number" }).notNull(),
		descripcion: text("descripcion").notNull().default("Su compra se descontó de lo que le debemos"),
		estado: text("estado").notNull().default("registrada"),
		...columnasDeCancelacion(),
		...columnasComunes(),
	},
	(tabla) => [
		index("compensaciones_tercero").on(tabla.terceroId, tabla.fecha),
		check("compensaciones_monto", sql`${tabla.montoCentavos} > 0 and ${tabla.montoCentavos} % 100 = 0`),
		check("compensaciones_estado", sql`${tabla.estado} in ('registrada', 'cancelada')`),
		check(
			"compensaciones_cancelada",
			sql`(${tabla.estado} = 'cancelada') = (${tabla.canceladoEn} is not null and ${tabla.motivoCancelacion} is not null)`,
		),
	],
);

/** Los estados de una deuda. */
export const estadosDeDeuda = ["abierta", "saldada", "cancelada"] as const;

/** Una deuda PR- con un acreedor: un préstamo o un crédito, en mensualidades. */
export const deudas = pgTable(
	"deudas",
	{
		id: uuid("id").primaryKey(),
		folio: text("folio").notNull(),
		terceroId: uuid("tercero_id")
			.notNull()
			.references(() => terceros.id),
		descripcion: text("descripcion").notNull(),
		montoTotalCentavos: bigint("monto_total_centavos", { mode: "number" }).notNull(),
		numeroMensualidades: integer("numero_mensualidades").notNull(),
		estado: text("estado").notNull().default("abierta"),
		saldadaEn: momento("saldada_en"),
		...columnasDeCancelacion(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("deudas_folio").on(tabla.folio),
		index("deudas_tercero").on(tabla.terceroId, tabla.estado),
		check("deudas_descripcion", sql`char_length(${tabla.descripcion}) >= 5`),
		check("deudas_monto", sql`${tabla.montoTotalCentavos} > 0 and ${tabla.numeroMensualidades} >= 1`),
		check("deudas_estado", sql`${tabla.estado} in (${valores(estadosDeDeuda)})`),
		check("deudas_saldada", sql`(${tabla.estado} = 'saldada') = (${tabla.saldadaEn} is not null)`),
		check(
			"deudas_cancelada",
			sql`(${tabla.estado} = 'cancelada') = (${tabla.canceladoEn} is not null and ${tabla.motivoCancelacion} is not null)`,
		),
	],
);

/** Cada mensualidad de una deuda: «mensualidad 8 de 20». Su cuenta por pagar la apunta. */
export const deudaMensualidades = pgTable(
	"deuda_mensualidades",
	{
		id: uuid("id").primaryKey(),
		deudaId: uuid("deuda_id")
			.notNull()
			.references(() => deudas.id),
		numero: integer("numero").notNull(),
		vence: date("vence", { mode: "string" }).notNull(),
		importeCentavos: bigint("importe_centavos", { mode: "number" }).notNull(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("deuda_mensualidades_numero").on(tabla.deudaId, tabla.numero),
		check("deuda_mensualidades_numero", sql`${tabla.numero} >= 1`),
		check("deuda_mensualidades_importe", sql`${tabla.importeCentavos} > 0`),
	],
);

/** Dónde se gastó: la fábrica, una ubicación (el Taller, una tienda) o la tienda en línea. */
export const areasDeGasto = ["fabrica", "ubicacion", "en_linea"] as const;

/** De dónde viene un gasto: Contaduría, un servicio de Mantenimiento o la caja de una tienda (con el POS). */
export const origenesDeGasto = ["manual", "mantenimiento", "tienda"] as const;

/** Un gasto G- de la fábrica, con su categoría, dónde se gastó, de dónde salió el dinero y su comprobante. */
export const gastos = pgTable(
	"gastos",
	{
		id: uuid("id").primaryKey(),
		folio: text("folio").notNull(),
		fecha: date("fecha", { mode: "string" }).notNull(),
		categoriaId: uuid("categoria_id")
			.notNull()
			.references(() => listaValores.id),
		montoCentavos: bigint("monto_centavos", { mode: "number" }).notNull(),
		area: text("area").notNull(),
		ubicacionId: uuid("ubicacion_id").references((): AnyPgColumn => ubicaciones.id),
		medio: text("medio"),
		cuentaFabricaId: uuid("cuenta_fabrica_id").references(() => listaValores.id),
		comprobanteArchivoId: uuid("comprobante_archivo_id").references(() => archivos.id),
		tipoComprobanteId: uuid("tipo_comprobante_id").references(() => listaValores.id),
		origen: text("origen").notNull(),
		servicioId: uuid("servicio_id").references((): AnyPgColumn => servicios.id),
		maquinaId: uuid("maquina_id").references((): AnyPgColumn => maquinas.id),
		/** @llavePendiente movimientos_caja.id */
		movimientoCajaId: uuid("movimiento_caja_id"),
		motivo: text("motivo"),
		paqueteContadorId: uuid("paquete_contador_id").references((): AnyPgColumn => paquetesContador.id),
		estado: text("estado").notNull().default("registrado"),
		...columnasDeCancelacion(),
		...columnasDeAparato(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("gastos_folio").on(tabla.folio),
		uniqueIndex("gastos_servicio").on(tabla.servicioId).where(sql`${tabla.servicioId} is not null`),
		index("gastos_fecha").on(tabla.fecha),
		index("gastos_categoria").on(tabla.categoriaId),
		check(
			"gastos_monto",
			sql`${tabla.montoCentavos} > 0 and (${tabla.origen} <> 'manual' or ${tabla.montoCentavos} % 100 = 0)`,
		),
		check("gastos_area", sql`${tabla.area} in (${valores(areasDeGasto)})`),
		check("gastos_ubicacion", sql`(${tabla.ubicacionId} is not null) = (${tabla.area} = 'ubicacion')`),
		check(
			"gastos_medio",
			sql`${tabla.medio} in ('efectivo', 'cuenta_fabrica') and (${tabla.medio} is null) = (${tabla.origen} = 'mantenimiento')`,
		),
		check("gastos_cuenta_fabrica", sql`(${tabla.cuentaFabricaId} is not null) = (${tabla.medio} = 'cuenta_fabrica')`),
		check("gastos_origen", sql`${tabla.origen} in (${valores(origenesDeGasto)})`),
		check(
			"gastos_servicio",
			sql`(${tabla.servicioId} is not null and ${tabla.maquinaId} is not null) = (${tabla.origen} = 'mantenimiento')`,
		),
		check("gastos_estado", sql`${tabla.estado} in ('registrado', 'cancelado')`),
		check(
			"gastos_cancelado",
			sql`(${tabla.estado} = 'cancelado') = (${tabla.canceladoEn} is not null and ${tabla.motivoCancelacion} is not null)`,
		),
	],
);

/** Qué pasa con lo que no alcanzó a descontarse. */
export const destinosNoAlcanzo = ["perdonado", "siguiente_semana"] as const;

/** La nómina de una semana de asistencia: nace por pagar al cerrarla y se paga una sola vez, congelada. */
export const nominas = pgTable(
	"nominas",
	{
		id: uuid("id").primaryKey(),
		asistenciaSemanaId: uuid("asistencia_semana_id")
			.notNull()
			.references((): AnyPgColumn => asistenciaSemanas.id),
		fechaInicio: date("fecha_inicio", { mode: "string" }).notNull(),
		fechaFin: date("fecha_fin", { mode: "string" }).notNull(),
		fechaPago: date("fecha_pago", { mode: "string" }).notNull(),
		estado: text("estado").notNull().default("por_pagar"),
		totalTiempoCentavos: bigint("total_tiempo_centavos", { mode: "number" }),
		totalPiezasCentavos: bigint("total_piezas_centavos", { mode: "number" }),
		totalCorreccionesCentavos: bigint("total_correcciones_centavos", { mode: "number" }),
		totalDescontadoCentavos: bigint("total_descontado_centavos", { mode: "number" }),
		totalCentavos: bigint("total_centavos", { mode: "number" }),
		personas: integer("personas"),
		reglaPiezasDanadas: boolean("regla_piezas_danadas"),
		reglaDescuentoMayor: text("regla_descuento_mayor"),
		pagadaEn: momento("pagada_en"),
		pagadaPor: uuid("pagada_por").references(() => usuarios.id),
		confirmadoConGoogleEn: momento("confirmado_con_google_en"),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("nominas_semana").on(tabla.asistenciaSemanaId),
		index("nominas_estado").on(tabla.estado, tabla.fechaInicio),
		check("nominas_estado", sql`${tabla.estado} in ('por_pagar', 'pagada')`),
		check("nominas_fechas", sql`${tabla.fechaInicio} <= ${tabla.fechaFin} and ${tabla.fechaFin} < ${tabla.fechaPago}`),
		check("nominas_regla_descuento", sql`${tabla.reglaDescuentoMayor} in ('perdonar', 'siguiente_semana')`),
		check(
			"nominas_pagada",
			sql`(${tabla.estado} = 'pagada') = (${tabla.pagadaEn} is not null)
				and (${tabla.estado} <> 'pagada' or (${tabla.totalTiempoCentavos} is not null
					and ${tabla.totalPiezasCentavos} is not null and ${tabla.totalCorreccionesCentavos} is not null
					and ${tabla.totalDescontadoCentavos} is not null and ${tabla.totalCentavos} >= 0
					and ${tabla.personas} is not null and ${tabla.reglaPiezasDanadas} is not null
					and ${tabla.reglaDescuentoMayor} is not null and ${tabla.pagadaPor} is not null
					and ${tabla.confirmadoConGoogleEn} is not null))`,
		),
	],
);

/** El renglón de una persona en una nómina pagada, con todo lo que se usó, congelado. Solo crece. */
export const nominaLineas = pgTable(
	"nomina_lineas",
	{
		id: uuid("id").primaryKey(),
		nominaId: uuid("nomina_id")
			.notNull()
			.references(() => nominas.id),
		personaId: uuid("persona_id")
			.notNull()
			.references((): AnyPgColumn => personas.id),
		area: text("area").notNull(),
		ubicacionId: uuid("ubicacion_id").references((): AnyPgColumn => ubicaciones.id),
		puesto: text("puesto").notNull(),
		formaPago: text("forma_pago").notNull(),
		bajaEn: date("baja_en", { mode: "string" }),
		dias: numeric("dias", { precision: 3, scale: 1 }).notNull().default("0"),
		pagoDiaCentavos: bigint("pago_dia_centavos", { mode: "number" }),
		importeTiempoCentavos: bigint("importe_tiempo_centavos", { mode: "number" }).notNull(),
		piezas: integer("piezas").notNull(),
		importePiezasCentavos: bigint("importe_piezas_centavos", { mode: "number" }).notNull(),
		correccionesCentavos: bigint("correcciones_centavos", { mode: "number" }).notNull(),
		brutoCentavos: bigint("bruto_centavos", { mode: "number" }).notNull(),
		descuentoNominaId: uuid("descuento_nomina_id").references((): AnyPgColumn => descuentosNomina.id),
		descuentoCentavos: bigint("descuento_centavos", { mode: "number" }).notNull(),
		descuentoMotivo: text("descuento_motivo"),
		arrastreCentavos: bigint("arrastre_centavos", { mode: "number" }).notNull(),
		descontadoCentavos: bigint("descontado_centavos", { mode: "number" }).notNull(),
		noAlcanzoCentavos: bigint("no_alcanzo_centavos", { mode: "number" }).notNull(),
		destinoNoAlcanzo: text("destino_no_alcanzo"),
		totalCentavos: bigint("total_centavos", { mode: "number" }).notNull(),
		medioPago: text("medio_pago"),
		referenciaPago: text("referencia_pago"),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("nomina_lineas_persona").on(tabla.nominaId, tabla.personaId),
		index("nomina_lineas_persona_id").on(tabla.personaId),
		check("nomina_lineas_forma_pago", sql`${tabla.formaPago} in ('tiempo', 'pieza', 'mixta')`),
		check("nomina_lineas_dias", sql`${tabla.dias} >= 0`),
		check("nomina_lineas_correcciones", sql`${tabla.correccionesCentavos} <= 0`),
		check(
			"nomina_lineas_bruto",
			sql`${tabla.brutoCentavos} = ${tabla.importeTiempoCentavos} + ${tabla.importePiezasCentavos} + ${tabla.correccionesCentavos}`,
		),
		check(
			"nomina_lineas_descuento",
			sql`${tabla.descuentoCentavos} >= 0 and ${tabla.arrastreCentavos} >= 0 and ${tabla.descontadoCentavos} >= 0
				and ${tabla.noAlcanzoCentavos} >= 0
				and ${tabla.descontadoCentavos} + ${tabla.noAlcanzoCentavos}
					= ${tabla.descuentoCentavos} + ${tabla.arrastreCentavos} + greatest(0, -${tabla.brutoCentavos})`,
		),
		check(
			"nomina_lineas_total",
			sql`${tabla.totalCentavos} >= 0
				and ${tabla.totalCentavos} = greatest(0, ${tabla.brutoCentavos}) - ${tabla.descontadoCentavos}`,
		),
		check(
			"nomina_lineas_no_alcanzo",
			sql`${tabla.destinoNoAlcanzo} in (${valores(destinosNoAlcanzo)})
				and (${tabla.destinoNoAlcanzo} is not null) = (${tabla.noAlcanzoCentavos} > 0)`,
		),
		check(
			"nomina_lineas_medio",
			sql`${tabla.medioPago} in ('efectivo', 'transferencia') and char_length(${tabla.referenciaPago}) between 3 and 30`,
		),
	],
);

/** Cada registro de la tablet que entró a una nómina, con su tarifa congelada: se paga y se corrige una sola vez. */
export const nominaLineaPiezas = pgTable(
	"nomina_linea_piezas",
	{
		id: uuid("id").primaryKey(),
		nominaLineaId: uuid("nomina_linea_id")
			.notNull()
			.references(() => nominaLineas.id),
		registroOperacionId: uuid("registro_operacion_id")
			.notNull()
			.references((): AnyPgColumn => registrosOperacion.id),
		tipo: text("tipo").notNull(),
		fecha: date("fecha", { mode: "string" }).notNull(),
		flujoOperacionId: uuid("flujo_operacion_id")
			.notNull()
			.references((): AnyPgColumn => flujoOperaciones.id),
		piezasBuenas: integer("piezas_buenas").notNull(),
		piezasDanadas: integer("piezas_danadas").notNull(),
		piezasPagadas: integer("piezas_pagadas").notNull(),
		tarifaCentavos: bigint("tarifa_centavos", { mode: "number" }).notNull(),
		importeCentavos: bigint("importe_centavos", { mode: "number" }).notNull(),
		sePaga: boolean("se_paga").notNull(),
		motivoNoPago: text("motivo_no_pago"),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("nomina_linea_piezas_registro").on(tabla.registroOperacionId, tabla.tipo),
		index("nomina_linea_piezas_linea").on(tabla.nominaLineaId),
		check("nomina_linea_piezas_tipo", sql`${tabla.tipo} in ('pago', 'correccion')`),
		check(
			"nomina_linea_piezas_importe",
			sql`${tabla.piezasPagadas} >= 0 and ${tabla.tarifaCentavos} >= 0
				and ((${tabla.tipo} = 'pago' and ${tabla.importeCentavos} >= 0)
					or (${tabla.tipo} = 'correccion' and ${tabla.importeCentavos} <= 0))`,
		),
		check(
			"nomina_linea_piezas_no_pago",
			sql`${tabla.motivoNoPago} in ('cobra_por_tiempo') and (${tabla.motivoNoPago} is null) = ${tabla.sePaga}`,
		),
	],
);

/** El descuento semanal de una persona: un monto fijo por semana, con su motivo. Uno vigente a lo más. */
export const descuentosNomina = pgTable(
	"descuentos_nomina",
	{
		id: uuid("id").primaryKey(),
		personaId: uuid("persona_id")
			.notNull()
			.references((): AnyPgColumn => personas.id),
		montoSemanalCentavos: bigint("monto_semanal_centavos", { mode: "number" }).notNull(),
		motivo: text("motivo").notNull(),
		estado: text("estado").notNull().default("vigente"),
		terminadoEn: momento("terminado_en"),
		terminadoPor: uuid("terminado_por").references(() => usuarios.id),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("descuentos_nomina_vigente").on(tabla.personaId).where(sql`${tabla.estado} = 'vigente'`),
		check(
			"descuentos_nomina_monto",
			sql`${tabla.montoSemanalCentavos} > 0 and ${tabla.montoSemanalCentavos} % 100 = 0`,
		),
		check("descuentos_nomina_estado", sql`${tabla.estado} in ('vigente', 'terminado')`),
		check("descuentos_nomina_terminado", sql`(${tabla.estado} = 'terminado') = (${tabla.terminadoEn} is not null)`),
	],
);

/** Los conceptos del paquete del contador (ver «Lo que lleva el paquete»). */
export const conceptosDelPaquete = [
	"cobranza_clientes",
	"anticipos_recibidos",
	"anticipos_aplicados",
	"ventas_tiendas",
	"anticipos_tiendas",
	"ventas_en_linea",
	"comisiones_pasarela",
	"reembolsos_en_linea",
	"devoluciones_saldo_favor",
	"pagos_proveedores_acreedores",
	"nomina",
	"gasto",
] as const;

/** Un concepto del paquete. */
export type ConceptoDelPaquete = (typeof conceptosDelPaquete)[number];

/** El paquete de un mes para el contador externo: se calcula al momento hasta que se manda, y entonces se congela. */
export const paquetesContador = pgTable(
	"paquetes_contador",
	{
		id: uuid("id").primaryKey(),
		mes: date("mes", { mode: "string" }).notNull(),
		fechaLimite: date("fecha_limite", { mode: "string" }).notNull(),
		estado: text("estado").notNull().default("por_enviar"),
		enviadoEn: momento("enviado_en"),
		enviadoPor: uuid("enviado_por").references(() => usuarios.id),
		archivoId: uuid("archivo_id").references(() => archivos.id),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("paquetes_contador_mes").on(tabla.mes),
		check("paquetes_contador_estado", sql`${tabla.estado} in ('por_enviar', 'enviado')`),
		check(
			"paquetes_contador_primer_dia",
			sql`extract(day from ${tabla.mes}) = 1 and ${tabla.fechaLimite} > ${tabla.mes}`,
		),
		check(
			"paquetes_contador_enviado",
			sql`(${tabla.estado} = 'enviado') = (${tabla.enviadoEn} is not null and ${tabla.enviadoPor} is not null)`,
		),
	],
);

/** Las cifras de un paquete, congeladas al mandarlo. Solo crecen. */
export const paqueteContadorRenglones = pgTable(
	"paquete_contador_renglones",
	{
		id: uuid("id").primaryKey(),
		paqueteContadorId: uuid("paquete_contador_id")
			.notNull()
			.references(() => paquetesContador.id),
		concepto: text("concepto").notNull(),
		categoriaId: uuid("categoria_id").references(() => listaValores.id),
		deMesesAnteriores: boolean("de_meses_anteriores").notNull().default(false),
		montoCentavos: bigint("monto_centavos", { mode: "number" }).notNull(),
		documentos: integer("documentos").notNull(),
		...columnasComunes(),
	},
	(tabla) => [
		unique("paquete_contador_renglones_unico")
			.on(tabla.paqueteContadorId, tabla.concepto, tabla.categoriaId, tabla.deMesesAnteriores)
			.nullsNotDistinct(),
		check("paquete_contador_renglones_concepto", sql`${tabla.concepto} in (${valores(conceptosDelPaquete)})`),
		check(
			"paquete_contador_renglones_gasto",
			sql`(${tabla.categoriaId} is not null) = (${tabla.concepto} = 'gasto')
				and (not ${tabla.deMesesAnteriores} or ${tabla.concepto} = 'gasto')`,
		),
		check("paquete_contador_renglones_montos", sql`${tabla.montoCentavos} >= 0 and ${tabla.documentos} >= 0`),
	],
);

/** Los tipos de un documento que regresa el contador. */
export const tiposDeDocumentoContador = ["declaracion", "acuse", "facturas", "documento"] as const;

/** Lo que el contador regresa: declaraciones, acuses, facturas y otros. */
export const documentosContador = pgTable(
	"documentos_contador",
	{
		id: uuid("id").primaryKey(),
		archivoId: uuid("archivo_id")
			.notNull()
			.references(() => archivos.id),
		nombre: text("nombre").notNull(),
		tipo: text("tipo").notNull().default("documento"),
		mes: date("mes", { mode: "string" }),
		paqueteContadorId: uuid("paquete_contador_id").references(() => paquetesContador.id),
		llegoEn: date("llego_en", { mode: "string" })
			.notNull()
			.default(sql`(now() at time zone 'America/Mexico_City')::date`),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("documentos_contador_archivo").on(tabla.archivoId),
		index("documentos_contador_mes").on(tabla.mes),
		index("documentos_contador_paquete").on(tabla.paqueteContadorId),
		check("documentos_contador_tipo", sql`${tabla.tipo} in (${valores(tiposDeDocumentoContador)})`),
		check("documentos_contador_mes", sql`${tabla.mes} is null or extract(day from ${tabla.mes}) = 1`),
	],
);

/** El tipo de aviso que suma Contaduría: los saldos que no cuadran con sus pagos. */
export const tiposDeAvisoDeContaduria = ["saldos_no_cuadran"] as const;
