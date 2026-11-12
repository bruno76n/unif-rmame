/**
 * Las tablas de `contaduria`: los terceros (fase 10, porque un proveedor no tiene nombre sin su tercero), el crédito de
 * cada cliente y sus cuentas por cobrar.
 * Fase 10 · docs/modulos/contaduria/terceros-y-deudas.md («La tabla `terceros`»)
 * Fase 15 · docs/modulos/contaduria/credito-de-clientes.md («La tabla `credito_clientes`») y
 * docs/modulos/contaduria/cuentas-por-cobrar.md («La tabla `cuentas_por_cobrar`»)
 *
 * Las columnas que apuntan a los clientes, los pedidos y las notas de Ventas llevan su `@llavePendiente` hasta la
 * fase 16. Lo demás de Contaduría (compensaciones, deudas, cuentas por pagar) llega en la fase 17.
 */

import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { columnasComunes, momento, valores } from "../../nucleo/base/columnas.ts";
import { usuarios } from "../admin/tablas.ts";

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
