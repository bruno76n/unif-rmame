/**
 * Las tablas de `direccion`: las autorizaciones (AU-).
 * Fase 7 · docs/modulos/direccion/autorizaciones.md («La tabla `autorizaciones`»)
 *
 * Cada tipo lleva su liga a su documento y las demás van vacías. Las ligas a documentos de fases posteriores
 * llevan su `@llavePendiente`. Un documento no tiene dos autorizaciones esperando: un único parcial por liga.
 */

import { tiposDeAutorizacion } from "@uniformame/compartido/contratos/direccion/autorizaciones";
import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	bigint,
	boolean,
	check,
	index,
	numeric,
	pgTable,
	text,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { columnasComunes, columnasDeAparato, columnasDeCancelacion, momento } from "../../nucleo/base/columnas.ts";
import { departamentos, usuarios } from "../admin/tablas.ts";
import { ordenCompraLineas } from "../compras/tablas.ts";
import { ajustes, recepciones } from "../inventario/tablas.ts";
import { desarrollos } from "../patronaje/tablas.ts";

/** Las ligas de cada tipo: la que lleva (no nula) y, por omisión, las demás vacías. */
const ligasDelTipo: Readonly<Record<(typeof tiposDeAutorizacion)[number], readonly string[]>> = {
	ajuste_inventario: ["ajuste_id"],
	recepcion_de_mas: ["recepcion_id", "orden_compra_linea_id"],
	nota_credito: ["nota_entrega_id", "nota_credito_id"],
	pago_fuera_de_lo_normal: ["factura_proveedor_id"],
	aprobar_desarrollo: ["desarrollo_id"],
	alta_usuario: ["usuario_solicitado_id"],
};

/** Todas las ligas. */
const todasLasLigas = [...new Set(Object.values(ligasDelTipo).flat())];

/** El CHECK por tipo: cada tipo con sus ligas llenas y las demás vacías. */
const ligasPorTipo = sql.raw(
	Object.entries(ligasDelTipo)
		.map(([tipo, suyas]) => {
			const llenas = suyas.map((liga) => `${liga} is not null`);
			const vacias = todasLasLigas.filter((liga) => !suyas.includes(liga)).map((liga) => `${liga} is null`);
			return `(tipo = '${tipo}' and ${[...llenas, ...vacias].join(" and ")})`;
		})
		.join(" or "),
);

/** Una autorización AU-: lo que un departamento pide y Dirección decide una sola vez. */
export const autorizaciones = pgTable(
	"autorizaciones",
	{
		id: uuid("id").primaryKey(),
		folio: text("folio").notNull(),
		tipo: text("tipo").notNull(),
		estado: text("estado").notNull().default("por_autorizar"),
		departamentoOrigenId: uuid("departamento_origen_id")
			.notNull()
			.references(() => departamentos.id),
		resumen: text("resumen").notNull(),
		detalle: text("detalle"),
		importeCentavos: bigint("importe_centavos", { mode: "number" }),
		importeFacturadoCentavos: bigint("importe_facturado_centavos", { mode: "number" }),
		cantidad: numeric("cantidad", { precision: 12, scale: 3 }),
		unidad: text("unidad"),
		ajusteId: uuid("ajuste_id").references((): AnyPgColumn => ajustes.id),
		recepcionId: uuid("recepcion_id").references((): AnyPgColumn => recepciones.id),
		ordenCompraLineaId: uuid("orden_compra_linea_id").references((): AnyPgColumn => ordenCompraLineas.id),
		/** @llavePendiente notas_entrega.id */
		notaEntregaId: uuid("nota_entrega_id"),
		/** @llavePendiente notas_credito.id */
		notaCreditoId: uuid("nota_credito_id"),
		/** @llavePendiente facturas_proveedor.id */
		facturaProveedorId: uuid("factura_proveedor_id"),
		desarrolloId: uuid("desarrollo_id").references((): AnyPgColumn => desarrollos.id),
		usuarioSolicitadoId: uuid("usuario_solicitado_id").references((): AnyPgColumn => usuarios.id),
		decididaEn: momento("decidida_en"),
		decididaPor: uuid("decidida_por").references((): AnyPgColumn => usuarios.id),
		decididaDesdeId: uuid("decidida_desde_id").references(() => departamentos.id),
		motivoRechazo: text("motivo_rechazo"),
		/** Pedida y decidida por la misma cuenta («Pedida por ti»). */
		mismaPersona: boolean("misma_persona").generatedAlwaysAs(sql`decidida_por = creado_por`),
		confirmadoConGoogleEn: momento("confirmado_con_google_en"),
		...columnasDeCancelacion(),
		...columnasDeAparato(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("autorizaciones_folio").on(tabla.folio),
		index("autorizaciones_por_autorizar")
			.on(tabla.estado, tabla.creadoEn)
			.where(sql`${tabla.estado} = 'por_autorizar'`),
		...(
			[
				["ajuste", tabla.ajusteId],
				["recepcion", tabla.recepcionId, tabla.ordenCompraLineaId],
				["nota_entrega", tabla.notaEntregaId],
				["nota_credito", tabla.notaCreditoId],
				["factura_proveedor", tabla.facturaProveedorId],
				["desarrollo", tabla.desarrolloId],
				["usuario_solicitado", tabla.usuarioSolicitadoId],
			] as const
		).map(([nombre, primera, ...resto]) =>
			uniqueIndex(`autorizaciones_una_pendiente_${nombre}`)
				.on(primera, ...resto)
				.where(sql`estado = 'por_autorizar'`),
		),
		check("autorizaciones_tipo", sql.raw(`tipo in (${tiposDeAutorizacion.map((tipo) => `'${tipo}'`).join(", ")})`)),
		check("autorizaciones_estado", sql`${tabla.estado} in ('por_autorizar', 'autorizada', 'rechazada', 'cancelada')`),
		check("autorizaciones_ligas", ligasPorTipo),
		check(
			"autorizaciones_rechazo",
			sql`${tabla.estado} <> 'rechazada' or char_length(${tabla.motivoRechazo}) between 5 and 90`,
		),
		check(
			"autorizaciones_decision",
			sql`${tabla.estado} not in ('autorizada', 'rechazada') or (${tabla.decididaEn} is not null and ${tabla.decididaPor} is not null)`,
		),
		check("autorizaciones_cancelacion", sql`${tabla.estado} <> 'cancelada' or ${tabla.canceladoEn} is not null`),
	],
);
