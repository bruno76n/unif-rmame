/**
 * Las tablas de `ventas`: los clientes externos y sus pedidos, con sus renglones y sus versiones, y las notas de
 * entrega con sus renglones.
 * Fase 16 · docs/modulos/ventas/clientes.md («La tabla `clientes`»), docs/modulos/ventas/pedidos.md (las tres tablas)
 * docs/modulos/ventas/notas-de-entrega.md y docs/modulos/ventas/notas-de-credito.md (las dos tablas de cada una)
 *
 * El nombre y el RFC del cliente viven en su tercero; aquí, lo que necesita Ventas para venderle y Aduana para
 * despacharle. Con estas tablas dejan su `@llavePendiente` las columnas que apuntan a los clientes, los pedidos y las
 * notas.
 */

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
import { columnasComunes, columnasDeBaja, momento, valores } from "../../nucleo/base/columnas.ts";
import { usuarios } from "../admin/tablas.ts";
import { escuelas, variantes } from "../catalogo/tablas.ts";
import { terceros } from "../contaduria/tablas.ts";
import { autorizaciones } from "../direccion/tablas.ts";
import { despachos } from "../inventario/tablas.ts";

/** Los tres tipos de cliente; el tipo no cambia. */
export const tiposDeCliente = ["escuela", "mayorista", "empresa_otro"] as const;

/** El cliente externo: escuela, mayorista o empresa u otro. */
export const clientes = pgTable(
	"clientes",
	{
		id: uuid("id").primaryKey(),
		terceroId: uuid("tercero_id")
			.notNull()
			.references(() => terceros.id),
		tipo: text("tipo").notNull(),
		escuelaId: uuid("escuela_id").references(() => escuelas.id),
		municipio: text("municipio").notNull(),
		direccionEntrega: text("direccion_entrega").notNull(),
		contacto: text("contacto"),
		telefono: text("telefono").notNull(),
		correo: text("correo"),
		...columnasDeBaja(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("clientes_tercero").on(tabla.terceroId),
		uniqueIndex("clientes_escuela").on(tabla.escuelaId).where(sql`${tabla.escuelaId} is not null`),
		index("clientes_tipo").on(tabla.tipo).where(sql`${tabla.bajaEn} is null`),
		check("clientes_tipo", sql`${tabla.tipo} in (${valores(tiposDeCliente)})`),
		check("clientes_escuela", sql`(${tabla.escuelaId} is not null) = (${tabla.tipo} = 'escuela')`),
		check("clientes_municipio", sql`char_length(${tabla.municipio}) between 3 and 60`),
		check("clientes_direccion", sql`char_length(${tabla.direccionEntrega}) between 8 and 200`),
		check("clientes_contacto", sql`char_length(${tabla.contacto}) <= 60`),
		check("clientes_telefono", sql`${tabla.telefono} ~ '^[0-9]{10}$'`),
		check("clientes_baja", sql`(${tabla.bajaEn} is null) = (${tabla.motivoBaja} is null)`),
	],
);

/** El estado de un pedido; `entregado` y `cancelado` son finales. */
export const estadosDePedido = ["borrador", "confirmado", "entregado", "cancelado"] as const;

/** Cómo paga el cliente un pedido. */
export const formasDePago = ["contado", "anticipo", "credito"] as const;

/** El pedido PE- de un cliente externo. Un agregado con sus renglones: cualquier cambio en ellos sube su versión. */
export const pedidos = pgTable(
	"pedidos",
	{
		id: uuid("id").primaryKey(),
		folio: text("folio").notNull(),
		clienteId: uuid("cliente_id")
			.notNull()
			.references(() => clientes.id),
		estado: text("estado").notNull(),
		fechaEntrega: date("fecha_entrega", { mode: "string" }).notNull(),
		formaPago: text("forma_pago").notNull(),
		diasCredito: integer("dias_credito").notNull(),
		versionVigente: integer("version_vigente").notNull().default(1),
		confirmadoEn: momento("confirmado_en"),
		confirmadoPor: uuid("confirmado_por").references(() => usuarios.id),
		entregadoEn: momento("entregado_en"),
		canceladoEn: momento("cancelado_en"),
		canceladoPor: uuid("cancelado_por").references(() => usuarios.id),
		motivoCancelacion: text("motivo_cancelacion"),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("pedidos_folio").on(tabla.folio),
		index("pedidos_cliente").on(tabla.clienteId, tabla.estado),
		index("pedidos_entrega")
			.on(tabla.estado, tabla.fechaEntrega)
			.where(sql`${tabla.estado} in ('borrador', 'confirmado')`),
		check("pedidos_estado", sql`${tabla.estado} in (${valores(estadosDePedido)})`),
		check("pedidos_forma_pago", sql`${tabla.formaPago} in (${valores(formasDePago)})`),
		check(
			"pedidos_dias_credito",
			sql`(${tabla.formaPago} = 'credito') = (${tabla.diasCredito} > 0) and ${tabla.diasCredito} >= 0`,
		),
		check("pedidos_version", sql`${tabla.versionVigente} >= 1`),
		check(
			"pedidos_confirmado",
			sql`(${tabla.estado} not in ('confirmado', 'entregado') or ${tabla.confirmadoEn} is not null)
				and (${tabla.estado} <> 'borrador' or ${tabla.confirmadoEn} is null)`,
		),
		check(
			"pedidos_cancelado",
			sql`(${tabla.estado} = 'cancelado') = (${tabla.canceladoEn} is not null and ${tabla.motivoCancelacion} is not null)`,
		),
		check("pedidos_entregado", sql`(${tabla.estado} = 'entregado') = (${tabla.entregadoEn} is not null)`),
	],
);

/** De dónde salió el precio sugerido de un renglón. */
export const origenesDeSugerido = ["lista_cliente", "porcentaje_cliente", "mayoreo", "mostrador"] as const;

/** Un renglón por talla de un pedido, con su precio; vale de `desde_version` hasta antes de `hasta_version`. */
export const pedidoRenglones = pgTable(
	"pedido_renglones",
	{
		id: uuid("id").primaryKey(),
		pedidoId: uuid("pedido_id")
			.notNull()
			.references(() => pedidos.id),
		varianteId: uuid("variante_id")
			.notNull()
			.references(() => variantes.id),
		cantidad: integer("cantidad").notNull(),
		desdeVersion: integer("desde_version").notNull(),
		hastaVersion: integer("hasta_version"),
		precioSugeridoCentavos: bigint("precio_sugerido_centavos", { mode: "number" }),
		origenSugerido: text("origen_sugerido"),
		porcentajeAplicado: numeric("porcentaje_aplicado", { precision: 6, scale: 3 }),
		precioDadoCentavos: bigint("precio_dado_centavos", { mode: "number" }),
		recargoEspecialCentavos: bigint("recargo_especial_centavos", { mode: "number" }).notNull().default(0),
		precioUnitarioCentavos: bigint("precio_unitario_centavos", { mode: "number" }).notNull(),
		congeladoEn: momento("congelado_en"),
		...columnasComunes(),
	},
	(tabla) => [
		index("pedido_renglones_pedido").on(tabla.pedidoId).where(sql`${tabla.hastaVersion} is null`),
		index("pedido_renglones_variante").on(tabla.varianteId).where(sql`${tabla.hastaVersion} is null`),
		check("pedido_renglones_cantidad", sql`${tabla.cantidad} >= 0`),
		check("pedido_renglones_versiones", sql`${tabla.hastaVersion} >= ${tabla.desdeVersion}`),
		check(
			"pedido_renglones_precio",
			sql`${tabla.precioUnitarioCentavos} > 0 and ${tabla.recargoEspecialCentavos} >= 0`,
		),
		check(
			"pedido_renglones_dado_o_sugerido",
			sql`${tabla.precioDadoCentavos} is not null or ${tabla.precioSugeridoCentavos} is not null`,
		),
		check(
			"pedido_renglones_origen",
			sql`${tabla.origenSugerido} is null or ${tabla.origenSugerido} in (${valores(origenesDeSugerido)})`,
		),
	],
);

/** De dónde nace una versión. */
export const origenesDeVersion = ["confirmacion", "modificacion", "pasar_a_bodega"] as const;

/** La foto de cada versión de un pedido confirmado. Solo crece. */
export const pedidoVersiones = pgTable(
	"pedido_versiones",
	{
		id: uuid("id").primaryKey(),
		pedidoId: uuid("pedido_id")
			.notNull()
			.references(() => pedidos.id),
		numero: integer("numero").notNull(),
		origen: text("origen").notNull(),
		fechaEntrega: date("fecha_entrega", { mode: "string" }).notNull(),
		formaPago: text("forma_pago").notNull(),
		diasCredito: integer("dias_credito").notNull(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("pedido_versiones_numero").on(tabla.pedidoId, tabla.numero),
		check("pedido_versiones_origen", sql`${tabla.origen} in (${valores(origenesDeVersion)})`),
		check("pedido_versiones_forma_pago", sql`${tabla.formaPago} in (${valores(formasDePago)})`),
	],
);

/** El estado de una nota de entrega; `entregada` y `cancelada` son finales. */
export const estadosDeNotaEntrega = ["por_despachar", "en_camino", "entregada", "cancelada"] as const;

/** La nota de entrega NV- con que sale de aduana lo listo de un pedido. Su subtotal no cambia desde que nace. */
export const notasEntrega = pgTable(
	"notas_entrega",
	{
		id: uuid("id").primaryKey(),
		folio: text("folio").notNull(),
		pedidoId: uuid("pedido_id")
			.notNull()
			.references(() => pedidos.id),
		clienteId: uuid("cliente_id")
			.notNull()
			.references(() => clientes.id),
		numeroEnPedido: integer("numero_en_pedido").notNull(),
		estado: text("estado").notNull(),
		subtotalCentavos: bigint("subtotal_centavos", { mode: "number" }).notNull(),
		anticipoAplicadoCentavos: bigint("anticipo_aplicado_centavos", { mode: "number" }).notNull().default(0),
		despachoId: uuid("despacho_id").references((): AnyPgColumn => despachos.id),
		despachadoEn: momento("despachado_en"),
		fechaEntrega: date("fecha_entrega", { mode: "string" }),
		entregadaEn: momento("entregada_en"),
		recibioNombre: text("recibio_nombre"),
		entregadaPor: uuid("entregada_por").references(() => usuarios.id),
		canceladoEn: momento("cancelado_en"),
		canceladoPor: uuid("cancelado_por").references(() => usuarios.id),
		motivoCancelacion: text("motivo_cancelacion"),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("notas_entrega_folio").on(tabla.folio),
		uniqueIndex("notas_entrega_numero").on(tabla.pedidoId, tabla.numeroEnPedido),
		index("notas_entrega_abiertas").on(tabla.estado).where(sql`${tabla.estado} in ('por_despachar', 'en_camino')`),
		index("notas_entrega_despacho").on(tabla.despachoId),
		check("notas_entrega_estado", sql`${tabla.estado} in (${valores(estadosDeNotaEntrega)})`),
		check("notas_entrega_numero", sql`${tabla.numeroEnPedido} >= 1`),
		check(
			"notas_entrega_montos",
			sql`${tabla.subtotalCentavos} > 0 and ${tabla.anticipoAplicadoCentavos} between 0 and ${tabla.subtotalCentavos}`,
		),
		check(
			"notas_entrega_despachada",
			sql`(${tabla.estado} in ('en_camino', 'entregada')) = (${tabla.despachoId} is not null and ${tabla.despachadoEn} is not null)`,
		),
		check(
			"notas_entrega_entregada",
			sql`(${tabla.estado} = 'entregada') = (${tabla.fechaEntrega} is not null and ${tabla.entregadaEn} is not null
				and ${tabla.recibioNombre} is not null and ${tabla.entregadaPor} is not null)`,
		),
		check(
			"notas_entrega_cancelada",
			sql`(${tabla.estado} = 'cancelada') = (${tabla.canceladoEn} is not null and ${tabla.canceladoPor} is not null
				and ${tabla.motivoCancelacion} is not null)`,
		),
	],
);

/** Un renglón por talla de una nota de entrega, con el precio que copió del pedido. */
export const notaEntregaLineas = pgTable(
	"nota_entrega_lineas",
	{
		id: uuid("id").primaryKey(),
		notaEntregaId: uuid("nota_entrega_id")
			.notNull()
			.references(() => notasEntrega.id),
		pedidoRenglonId: uuid("pedido_renglon_id")
			.notNull()
			.references(() => pedidoRenglones.id),
		varianteId: uuid("variante_id")
			.notNull()
			.references(() => variantes.id),
		cantidad: integer("cantidad").notNull(),
		precioUnitarioCentavos: bigint("precio_unitario_centavos", { mode: "number" }).notNull(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("nota_entrega_lineas_variante").on(tabla.notaEntregaId, tabla.varianteId),
		index("nota_entrega_lineas_por_variante").on(tabla.varianteId),
		check("nota_entrega_lineas_cantidad", sql`${tabla.cantidad} > 0`),
		check("nota_entrega_lineas_precio", sql`${tabla.precioUnitarioCentavos} > 0`),
	],
);

/** El estado de una nota de crédito: `autorizada` y `rechazada` ya no cambian. */
export const estadosDeNotaCredito = ["por_autorizar", "autorizada", "rechazada"] as const;

/** La nota de crédito NC- que corrige una nota de entrega ya entregada. Su folio nace al autorizarse. */
export const notasCredito = pgTable(
	"notas_credito",
	{
		id: uuid("id").primaryKey(),
		folio: text("folio"),
		notaEntregaId: uuid("nota_entrega_id")
			.notNull()
			.references(() => notasEntrega.id),
		pedidoId: uuid("pedido_id")
			.notNull()
			.references(() => pedidos.id),
		clienteId: uuid("cliente_id")
			.notNull()
			.references(() => clientes.id),
		estado: text("estado").notNull(),
		quePaso: text("que_paso").notNull(),
		montoCentavos: bigint("monto_centavos", { mode: "number" }).notNull(),
		autorizacionId: uuid("autorizacion_id").references((): AnyPgColumn => autorizaciones.id),
		autorizadaEn: momento("autorizada_en"),
		rechazadaEn: momento("rechazada_en"),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("notas_credito_folio").on(tabla.folio).where(sql`${tabla.folio} is not null`),
		uniqueIndex("notas_credito_por_autorizar").on(tabla.notaEntregaId).where(sql`${tabla.estado} = 'por_autorizar'`),
		uniqueIndex("notas_credito_autorizacion").on(tabla.autorizacionId),
		index("notas_credito_cliente").on(tabla.clienteId),
		check("notas_credito_estado", sql`${tabla.estado} in (${valores(estadosDeNotaCredito)})`),
		check("notas_credito_monto", sql`${tabla.montoCentavos} > 0`),
		check(
			"notas_credito_autorizada",
			sql`(${tabla.estado} = 'autorizada') = (${tabla.folio} is not null and ${tabla.autorizadaEn} is not null)`,
		),
		check("notas_credito_rechazada", sql`(${tabla.estado} = 'rechazada') = (${tabla.rechazadaEn} is not null)`),
	],
);

/** Las piezas que regresan con una nota de crédito, por renglón de su nota. */
export const notaCreditoLineas = pgTable(
	"nota_credito_lineas",
	{
		id: uuid("id").primaryKey(),
		notaCreditoId: uuid("nota_credito_id")
			.notNull()
			.references(() => notasCredito.id),
		notaEntregaLineaId: uuid("nota_entrega_linea_id")
			.notNull()
			.references(() => notaEntregaLineas.id),
		varianteId: uuid("variante_id")
			.notNull()
			.references(() => variantes.id),
		cantidad: integer("cantidad").notNull(),
		precioUnitarioCentavos: bigint("precio_unitario_centavos", { mode: "number" }).notNull(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("nota_credito_lineas_renglon").on(tabla.notaCreditoId, tabla.notaEntregaLineaId),
		index("nota_credito_lineas_por_renglon").on(tabla.notaEntregaLineaId),
		check("nota_credito_lineas_cantidad", sql`${tabla.cantidad} > 0`),
		check("nota_credito_lineas_precio", sql`${tabla.precioUnitarioCentavos} > 0`),
	],
);
