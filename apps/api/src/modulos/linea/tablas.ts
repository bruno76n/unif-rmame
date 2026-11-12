/**
 * Las tablas de `linea`: el pedido W- de la tienda en línea, con todo congelado al llegar, y sus renglones.
 * Fase 18 · docs/modulos/linea/pedidos-en-linea.md («La tabla `pedidos_linea`» y «La tabla `pedido_linea_renglones`»)
 *
 * Con estas tablas dejan su `@llavePendiente` las columnas de reservas y traspasos que apuntan a los W-.
 */

import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgTable, smallint, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { columnasComunes, momento, valores } from "../../nucleo/base/columnas.ts";
import { dispositivos, usuarios } from "../admin/tablas.ts";
import { variantes } from "../catalogo/tablas.ts";

/** Los estados de un W- (ver «Estados»). */
export const estadosDePedidoLinea = [
	"esperando_pago",
	"por_surtir",
	"esperando_prendas",
	"listo_para_empacar",
	"cancelado",
	"vencido",
] as const;

/** Un estado de un W-. */
export type EstadoDePedidoLinea = (typeof estadosDePedidoLinea)[number];

/** La promesa de un W- pagado: todo en Bodega o Aduana, o algo en una tienda. */
export const promesasDeLinea = ["sale_hoy", "sale_manana"] as const;

/** Los estados del pago. */
export const estadosDePagoLinea = ["pagado", "pendiente", "vencido"] as const;

/** El pedido W- de uniformame.mx, con el cliente, el envío, los totales y el pago congelados al llegar. */
export const pedidosLinea = pgTable(
	"pedidos_linea",
	{
		id: uuid("id").primaryKey(),
		folio: text("folio").notNull(),
		clienteNombre: text("cliente_nombre").notNull(),
		clienteCorreo: text("cliente_correo").notNull(),
		clienteTelefono: text("cliente_telefono"),
		envioDestinatario: text("envio_destinatario").notNull(),
		envioTelefono: text("envio_telefono"),
		envioCalle: text("envio_calle").notNull(),
		envioNumeroExterior: text("envio_numero_exterior").notNull(),
		envioNumeroInterior: text("envio_numero_interior"),
		envioColonia: text("envio_colonia").notNull(),
		envioMunicipio: text("envio_municipio").notNull(),
		envioEntidadFederativa: text("envio_entidad_federativa").notNull(),
		envioCodigoPostal: text("envio_codigo_postal").notNull(),
		envioReferencias: text("envio_referencias"),
		envioMetodo: text("envio_metodo").notNull(),
		envioPaqueteria: text("envio_paqueteria").notNull(),
		envioCostoCentavos: bigint("envio_costo_centavos", { mode: "number" }).notNull(),
		cuponCodigo: text("cupon_codigo"),
		subtotalCentavos: bigint("subtotal_centavos", { mode: "number" }).notNull(),
		descuentoCentavos: bigint("descuento_centavos", { mode: "number" }).notNull(),
		descuentoEnvioCentavos: bigint("descuento_envio_centavos", { mode: "number" }).notNull(),
		totalCentavos: bigint("total_centavos", { mode: "number" }).notNull(),
		estado: text("estado").notNull(),
		estadoEn: momento("estado_en").notNull(),
		promesa: text("promesa"),
		pagoEstado: text("pago_estado").notNull(),
		pagoPasarela: text("pago_pasarela").notNull(),
		pagoReferencia: text("pago_referencia").notNull(),
		pagoMetodo: text("pago_metodo").notNull(),
		pagoMontoCentavos: bigint("pago_monto_centavos", { mode: "number" }).notNull(),
		pagoComisionCentavos: bigint("pago_comision_centavos", { mode: "number" }),
		pagadoEn: momento("pagado_en"),
		pagoVenceEn: momento("pago_vence_en"),
		/** Lo que mandó la pasarela, tal cual. Nunca sale en una pantalla. */
		pagoRespuesta: jsonb("pago_respuesta"),
		dispositivoId: uuid("dispositivo_id")
			.notNull()
			.references(() => dispositivos.id),
		canceladoEn: momento("cancelado_en"),
		canceladoPor: uuid("cancelado_por").references(() => usuarios.id),
		motivoCancelacion: text("motivo_cancelacion"),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("pedidos_linea_folio").on(tabla.folio),
		uniqueIndex("pedidos_linea_pago").on(tabla.pagoPasarela, tabla.pagoReferencia),
		index("pedidos_linea_estado").on(tabla.estado),
		index("pedidos_linea_correo").on(tabla.clienteCorreo),
		check("pedidos_linea_estado", sql`${tabla.estado} in (${valores(estadosDePedidoLinea)})`),
		check("pedidos_linea_promesa", sql`${tabla.promesa} is null or ${tabla.promesa} in (${valores(promesasDeLinea)})`),
		check("pedidos_linea_pago_estado", sql`${tabla.pagoEstado} in (${valores(estadosDePagoLinea)})`),
		check(
			"pedidos_linea_montos",
			sql`${tabla.envioCostoCentavos} >= 0 and ${tabla.subtotalCentavos} >= 0 and ${tabla.descuentoCentavos} >= 0
				and ${tabla.descuentoEnvioCentavos} >= 0 and ${tabla.pagoMontoCentavos} >= 0
				and (${tabla.pagoComisionCentavos} is null or ${tabla.pagoComisionCentavos} >= 0)`,
		),
		check(
			"pedidos_linea_pagado",
			sql`(${tabla.pagoEstado} <> 'pagado' or ${tabla.pagadoEn} is not null)
				and (${tabla.pagoEstado} <> 'pendiente' or ${tabla.pagoVenceEn} is not null)`,
		),
		check(
			"pedidos_linea_cancelado",
			sql`(${tabla.estado} = 'cancelado') = (${tabla.canceladoEn} is not null and ${tabla.motivoCancelacion} is not null)`,
		),
	],
);

/** Una prenda de un W-, con su nombre, su talla y su precio congelados. */
export const pedidoLineaRenglones = pgTable(
	"pedido_linea_renglones",
	{
		id: uuid("id").primaryKey(),
		pedidoLineaId: uuid("pedido_linea_id")
			.notNull()
			.references(() => pedidosLinea.id),
		renglon: smallint("renglon").notNull(),
		varianteId: uuid("variante_id")
			.notNull()
			.references(() => variantes.id),
		productoNombre: text("producto_nombre").notNull(),
		talla: text("talla").notNull(),
		cantidad: integer("cantidad").notNull(),
		precioUnitarioCentavos: bigint("precio_unitario_centavos", { mode: "number" }).notNull(),
		paqueteNumero: smallint("paquete_numero"),
		descuentoPaqueteCentavos: bigint("descuento_paquete_centavos", { mode: "number" }).notNull().default(0),
		descuentoCentavos: bigint("descuento_centavos", { mode: "number" }).notNull().default(0),
		importeCentavos: bigint("importe_centavos", { mode: "number" }).notNull(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("pedido_linea_renglones_renglon").on(tabla.pedidoLineaId, tabla.renglon),
		index("pedido_linea_renglones_variante").on(tabla.varianteId),
		check("pedido_linea_renglones_cantidad", sql`${tabla.cantidad} > 0`),
		check(
			"pedido_linea_renglones_montos",
			sql`${tabla.precioUnitarioCentavos} >= 0 and ${tabla.descuentoPaqueteCentavos} >= 0 and ${tabla.descuentoCentavos} >= 0`,
		),
		check(
			"pedido_linea_renglones_importe",
			sql`${tabla.importeCentavos} = ${tabla.cantidad} * ${tabla.precioUnitarioCentavos} - ${tabla.descuentoPaqueteCentavos} - ${tabla.descuentoCentavos}`,
		),
	],
);
