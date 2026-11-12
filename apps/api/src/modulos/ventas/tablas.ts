/**
 * Las tablas de `ventas`: los clientes externos y sus pedidos, con sus renglones y sus versiones.
 * Fase 16 · docs/modulos/ventas/clientes.md («La tabla `clientes`») y docs/modulos/ventas/pedidos.md (las tres tablas)
 *
 * El nombre y el RFC del cliente viven en su tercero; aquí, lo que necesita Ventas para venderle y Aduana para
 * despacharle. Con esta tabla dejan su `@llavePendiente` las columnas que apuntan a los clientes.
 */

import { sql } from "drizzle-orm";
import { bigint, check, date, index, integer, numeric, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { columnasComunes, columnasDeBaja, momento, valores } from "../../nucleo/base/columnas.ts";
import { usuarios } from "../admin/tablas.ts";
import { escuelas, variantes } from "../catalogo/tablas.ts";
import { terceros } from "../contaduria/tablas.ts";

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
