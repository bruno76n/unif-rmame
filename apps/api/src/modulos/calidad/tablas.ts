/**
 * Las tablas de `calidad`: la revisión de cada lote con sus tallas y sus rechazos, los reprocesos que nacen de los
 * rechazos, el catálogo de defectos con las operaciones que suelen causarlos y los reclamos.
 * Fase 13 · docs/modulos/calidad/revision-de-lotes.md («La tabla `revisiones`», `revision_tallas`, `rechazos`,
 * `reprocesos`, `defectos` y `defecto_operaciones`); parte 2 · reclamos-y-devoluciones.md («La tabla `reclamos`»)
 * Fase 16 · docs/modulos/calidad/reclamos-y-devoluciones.md («La tabla `revisiones_devolucion`»)
 *
 * La revisión nace cerrada y no cambia: ella, sus tallas y sus rechazos solo crecen. Ninguna baja a un aparato todavía
 * (los defectos bajan a la caja con el POS).
 */

import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
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
import { columnasComunes, columnasDeBaja, momento, valores } from "../../nucleo/base/columnas.ts";
import { usuarios } from "../admin/tablas.ts";
import { variantes } from "../catalogo/tablas.ts";
import { traspasoLineas, traspasos, ubicaciones } from "../inventario/tablas.ts";
import { personas } from "../personal/tablas.ts";
import { flujoOperaciones, lotes, operaciones } from "../produccion/tablas.ts";
import { clientes, notasCredito, notasEntrega } from "../ventas/tablas.ts";

/** De dónde viene un reclamo. */
export const origenesDeReclamo = ["cliente_externo", "tienda"] as const;

/** Los estados de un reclamo. */
export const estadosDeReclamo = ["por_resolver", "resuelto"] as const;

/** Los estados de un reproceso. */
export const estadosDeReproceso = ["en_reproceso", "listo"] as const;

/** El catálogo de defectos: un nombre único sin importar mayúsculas. */
export const defectos = pgTable(
	"defectos",
	{
		id: uuid("id").primaryKey(),
		nombre: text("nombre").notNull(),
		...columnasDeBaja(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("defectos_nombre").on(sql`lower(${tabla.nombre})`),
		check("defectos_nombre_largo", sql`char_length(${tabla.nombre}) between 4 and 60`),
	],
);

/** Las operaciones que suelen causar cada defecto. */
export const defectoOperaciones = pgTable(
	"defecto_operaciones",
	{
		id: uuid("id").primaryKey(),
		defectoId: uuid("defecto_id")
			.notNull()
			.references(() => defectos.id),
		operacionId: uuid("operacion_id")
			.notNull()
			.references(() => operaciones.id),
		bajaEn: momento("baja_en"),
		bajaPor: uuid("baja_por").references(() => usuarios.id),
		motivoBaja: text("motivo_baja"),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("defecto_operaciones_vigente")
			.on(tabla.defectoId, tabla.operacionId)
			.where(sql`${tabla.bajaEn} is null`),
	],
);

/** La revisión de un lote: una por lote, nace cerrada. */
export const revisiones = pgTable(
	"revisiones",
	{
		id: uuid("id").primaryKey(),
		loteId: uuid("lote_id")
			.notNull()
			.references(() => lotes.id),
		revisadoPor: uuid("revisado_por")
			.notNull()
			.references(() => usuarios.id),
		personaId: uuid("persona_id").references(() => personas.id),
		revisadoEn: momento("revisado_en").notNull(),
		fecha: date("fecha", { mode: "string" }).notNull(),
		piezasRevisadas: integer("piezas_revisadas").notNull(),
		piezasAprobadas: integer("piezas_aprobadas").notNull(),
		revisoQuienCoso: boolean("reviso_quien_coso").notNull(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("revisiones_lote").on(tabla.loteId),
		index("revisiones_fecha").on(tabla.fecha),
		check(
			"revisiones_piezas",
			sql`${tabla.piezasAprobadas} >= 0 and ${tabla.piezasAprobadas} <= ${tabla.piezasRevisadas}`,
		),
	],
);

/** Lo revisado y lo aprobado de cada talla: las aprobadas quedan congeladas para Aduana. */
export const revisionTallas = pgTable(
	"revision_tallas",
	{
		id: uuid("id").primaryKey(),
		revisionId: uuid("revision_id")
			.notNull()
			.references(() => revisiones.id),
		varianteId: uuid("variante_id")
			.notNull()
			.references(() => variantes.id),
		piezasRevisadas: integer("piezas_revisadas").notNull(),
		piezasAprobadas: integer("piezas_aprobadas").notNull(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("revision_tallas_variante").on(tabla.revisionId, tabla.varianteId),
		check(
			"revision_tallas_piezas",
			sql`${tabla.piezasAprobadas} >= 0 and ${tabla.piezasAprobadas} <= ${tabla.piezasRevisadas}`,
		),
	],
);

/** Un rechazo: el defecto, la operación y la persona que lo causaron, en una talla. */
export const rechazos = pgTable(
	"rechazos",
	{
		id: uuid("id").primaryKey(),
		revisionId: uuid("revision_id")
			.notNull()
			.references(() => revisiones.id),
		defectoId: uuid("defecto_id")
			.notNull()
			.references(() => defectos.id),
		flujoOperacionId: uuid("flujo_operacion_id")
			.notNull()
			.references(() => flujoOperaciones.id),
		personaId: uuid("persona_id")
			.notNull()
			.references(() => personas.id),
		varianteId: uuid("variante_id")
			.notNull()
			.references(() => variantes.id),
		piezas: integer("piezas").notNull(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("rechazos_renglon").on(tabla.revisionId, tabla.defectoId, tabla.flujoOperacionId, tabla.varianteId),
		index("rechazos_operacion").on(tabla.flujoOperacionId),
		index("rechazos_persona").on(tabla.personaId),
		check("rechazos_piezas", sql`${tabla.piezas} > 0`),
	],
);

/** Lo rechazado que regresa al taller: uno por rechazo, con el folio de su lote y su número. */
export const reprocesos = pgTable(
	"reprocesos",
	{
		id: uuid("id").primaryKey(),
		folio: text("folio").notNull(),
		rechazoId: uuid("rechazo_id")
			.notNull()
			.references(() => rechazos.id),
		loteId: uuid("lote_id")
			.notNull()
			.references(() => lotes.id),
		estado: text("estado", { enum: estadosDeReproceso }).notNull().default("en_reproceso"),
		aprobadoEn: momento("aprobado_en"),
		aprobadoPor: uuid("aprobado_por").references(() => usuarios.id),
		piezasAprobadas: integer("piezas_aprobadas"),
		piezasMerma: integer("piezas_merma"),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("reprocesos_folio").on(tabla.folio),
		uniqueIndex("reprocesos_rechazo").on(tabla.rechazoId),
		index("reprocesos_lote_estado").on(tabla.loteId, tabla.estado),
		check("reprocesos_estado", sql`${tabla.estado} in (${valores(estadosDeReproceso)})`),
		check(
			"reprocesos_aprobado",
			sql`(${tabla.estado} = 'listo') = (${tabla.aprobadoEn} is not null and ${tabla.aprobadoPor} is not null
				and ${tabla.piezasAprobadas} is not null and ${tabla.piezasMerma} is not null)`,
		),
		check(
			"reprocesos_piezas",
			sql`(${tabla.piezasAprobadas} is null or ${tabla.piezasAprobadas} >= 0)
				and (${tabla.piezasMerma} is null or ${tabla.piezasMerma} >= 0)`,
		),
	],
);

/** Un reclamo de un cliente o de una tienda, del código de la prenda a su lote, su operación y su persona. */
export const reclamos = pgTable(
	"reclamos",
	{
		id: uuid("id").primaryKey(),
		folio: text("folio").notNull(),
		fecha: date("fecha", { mode: "string" }).notNull(),
		origen: text("origen", { enum: origenesDeReclamo }).notNull().default("cliente_externo"),
		clienteId: uuid("cliente_id").references((): AnyPgColumn => clientes.id),
		ubicacionId: uuid("ubicacion_id").references(() => ubicaciones.id),
		/** @llavePendiente salidas_tienda.id */
		salidaTiendaId: uuid("salida_tienda_id"),
		notaEntregaId: uuid("nota_entrega_id").references((): AnyPgColumn => notasEntrega.id),
		varianteId: uuid("variante_id")
			.notNull()
			.references(() => variantes.id),
		loteId: uuid("lote_id")
			.notNull()
			.references(() => lotes.id),
		defectoId: uuid("defecto_id")
			.notNull()
			.references(() => defectos.id),
		flujoOperacionId: uuid("flujo_operacion_id")
			.notNull()
			.references(() => flujoOperaciones.id),
		personaId: uuid("persona_id").references(() => personas.id),
		piezas: integer("piezas").notNull(),
		queDiceCliente: text("que_dice_cliente").notNull(),
		estado: text("estado", { enum: estadosDeReclamo }).notNull().default("por_resolver"),
		resueltoEn: momento("resuelto_en"),
		resueltoPor: uuid("resuelto_por").references(() => usuarios.id),
		resolucion: text("resolucion"),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("reclamos_folio").on(tabla.folio),
		index("reclamos_estado").on(tabla.estado),
		index("reclamos_lote").on(tabla.loteId),
		index("reclamos_variante").on(tabla.varianteId),
		check("reclamos_origen", sql`${tabla.origen} in (${valores(origenesDeReclamo)})`),
		check("reclamos_cliente", sql`(${tabla.origen} = 'cliente_externo') = (${tabla.clienteId} is not null)`),
		check("reclamos_tienda", sql`(${tabla.origen} = 'tienda') = (${tabla.ubicacionId} is not null)`),
		check("reclamos_piezas", sql`${tabla.piezas} > 0`),
		check("reclamos_estado", sql`${tabla.estado} in (${valores(estadosDeReclamo)})`),
		check(
			"reclamos_resuelto",
			sql`(${tabla.estado} = 'resuelto') = (${tabla.resueltoEn} is not null and ${tabla.resueltoPor} is not null)`,
		),
		check("reclamos_resolucion", sql`${tabla.resolucion} is null or char_length(${tabla.resolucion}) <= 200`),
	],
);

/** De dónde viene una devolución que revisa Calidad: sale del tipo de su traspaso. */
export const origenesDeDevolucion = ["salida_tienda", "nota_credito", "devolucion_linea"] as const;

/** Lo que decide Calidad de una devolución. */
export const decisionesDeDevolucion = ["sirve", "merma"] as const;

/** La revisión de Calidad de lo que regresó con defecto: una por renglón y decisión. Solo crece. */
export const revisionesDevolucion = pgTable(
	"revisiones_devolucion",
	{
		id: uuid("id").primaryKey(),
		traspasoId: uuid("traspaso_id")
			.notNull()
			.references((): AnyPgColumn => traspasos.id),
		traspasoLineaId: uuid("traspaso_linea_id")
			.notNull()
			.references((): AnyPgColumn => traspasoLineas.id),
		origen: text("origen").notNull(),
		/** @llavePendiente salidas_tienda.id */
		salidaTiendaId: uuid("salida_tienda_id"),
		notaCreditoId: uuid("nota_credito_id").references((): AnyPgColumn => notasCredito.id),
		varianteId: uuid("variante_id")
			.notNull()
			.references(() => variantes.id),
		loteId: uuid("lote_id").references(() => lotes.id),
		piezas: integer("piezas").notNull(),
		decision: text("decision").notNull(),
		defectoId: uuid("defecto_id").references(() => defectos.id),
		motivo: text("motivo"),
		revisadoPor: uuid("revisado_por")
			.notNull()
			.references(() => usuarios.id),
		revisadoEn: momento("revisado_en").notNull(),
		...columnasComunes(),
	},
	(tabla) => [
		index("revisiones_devolucion_traspaso").on(tabla.traspasoId),
		index("revisiones_devolucion_linea").on(tabla.traspasoLineaId),
		check("revisiones_devolucion_origen", sql`${tabla.origen} in (${valores(origenesDeDevolucion)})`),
		check("revisiones_devolucion_decision", sql`${tabla.decision} in (${valores(decisionesDeDevolucion)})`),
		check("revisiones_devolucion_piezas", sql`${tabla.piezas} > 0`),
		check("revisiones_devolucion_motivo", sql`${tabla.decision} <> 'merma' or char_length(trim(${tabla.motivo})) > 0`),
	],
);
