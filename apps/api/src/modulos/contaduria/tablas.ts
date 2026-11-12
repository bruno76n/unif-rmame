/**
 * Las tablas de `contaduria`: los terceros (fase 10, porque un proveedor no tiene nombre sin su tercero), el crédito de
 * cada cliente, sus cuentas por cobrar, los pagos con sus aplicaciones, el libro del saldo a favor y el de los anticipos.
 * Fase 10 · docs/modulos/contaduria/terceros-y-deudas.md («La tabla `terceros`»)
 * Fase 15 · docs/modulos/contaduria/credito-de-clientes.md («La tabla `credito_clientes`») y
 * docs/modulos/contaduria/cuentas-por-cobrar.md («La tabla `cuentas_por_cobrar`») y
 * docs/modulos/contaduria/pagos-y-saldo-a-favor.md (las tres tablas) y docs/modulos/contaduria/anticipos.md
 *
 * Las columnas que apuntan a los clientes, los pedidos y las notas de Ventas llevan su `@llavePendiente` hasta la
 * fase 16. Lo demás de Contaduría (compensaciones, deudas, cuentas por pagar) llega en la fase 17.
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
	pgTable,
	text,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { columnasComunes, momento, valores } from "../../nucleo/base/columnas.ts";
import { listaValores, usuarios } from "../admin/tablas.ts";

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
		/** @llavePendiente clientes.id */
		clienteId: uuid("cliente_id").notNull(),
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
		/** @llavePendiente notas_entrega.id */
		notaEntregaId: uuid("nota_entrega_id").notNull(),
		/** @llavePendiente pedidos.id */
		pedidoId: uuid("pedido_id").notNull(),
		/** @llavePendiente clientes.id */
		clienteId: uuid("cliente_id").notNull(),
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
		/** @llavePendiente clientes.id */
		clienteId: uuid("cliente_id"),
		/** @llavePendiente notas_entrega.id */
		notaEntregaId: uuid("nota_entrega_id"),
		/** @llavePendiente pedidos.id */
		pedidoId: uuid("pedido_id"),
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
		check("pagos_monto", sql`${tabla.montoCentavos} > 0 and ${tabla.montoCentavos} % 100 = 0`),
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
		/** @llavePendiente clientes.id */
		clienteId: uuid("cliente_id").notNull(),
		terceroId: uuid("tercero_id")
			.notNull()
			.references(() => terceros.id),
		tipo: text("tipo").notNull(),
		origen: text("origen"),
		montoCentavos: bigint("monto_centavos", { mode: "number" }).notNull(),
		fecha: date("fecha", { mode: "string" }).notNull(),
		/** @llavePendiente pedidos.id */
		pedidoId: uuid("pedido_id"),
		/** @llavePendiente notas_credito.id */
		notaCreditoId: uuid("nota_credito_id"),
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
		/** @llavePendiente compensaciones.id */
		compensacionId: uuid("compensacion_id"),
		/** @llavePendiente notas_credito.id */
		notaCreditoId: uuid("nota_credito_id"),
		saldoFavorMovimientoId: uuid("saldo_favor_movimiento_id").references((): AnyPgColumn => saldoFavorMovimientos.id),
		cuentaPorCobrarId: uuid("cuenta_por_cobrar_id").references(() => cuentasPorCobrar.id),
		/** @llavePendiente cuentas_por_pagar.id */
		cuentaPorPagarId: uuid("cuenta_por_pagar_id"),
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
		/** @llavePendiente pedidos.id */
		pedidoId: uuid("pedido_id").notNull(),
		/** @llavePendiente clientes.id */
		clienteId: uuid("cliente_id").notNull(),
		tipo: text("tipo").notNull(),
		montoCentavos: bigint("monto_centavos", { mode: "number" }).notNull(),
		fecha: date("fecha", { mode: "string" }).notNull(),
		pagoId: uuid("pago_id").references(() => pagos.id),
		saldoFavorMovimientoId: uuid("saldo_favor_movimiento_id").references(() => saldoFavorMovimientos.id),
		/** @llavePendiente notas_entrega.id */
		notaEntregaId: uuid("nota_entrega_id"),
		anticipoAplicadoId: uuid("anticipo_aplicado_id").references((): AnyPgColumn => anticipos.id),
		estado: text("estado").notNull().default("vigente"),
		...columnasDeCancelacion(),
		...columnasComunes(),
	},
	(tabla) => [
		index("anticipos_pedido").on(tabla.pedidoId, tabla.estado),
		index("anticipos_nota").on(tabla.notaEntregaId),
		index("anticipos_pago").on(tabla.pagoId),
		uniqueIndex("anticipos_aplicado").on(tabla.anticipoAplicadoId),
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
