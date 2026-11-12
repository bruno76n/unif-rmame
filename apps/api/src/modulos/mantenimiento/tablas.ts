/**
 * Las tablas de `mantenimiento`: los tipos de máquina, las máquinas, los motivos de falla, las fallas, los servicios y
 * los técnicos.
 * Fase 13 · docs/modulos/mantenimiento/maquinas-fallas-y-servicios.md («La tabla `tipos_maquina`», `maquinas`,
 * `motivos_falla`, `fallas`, `servicios` y `tecnicos`)
 *
 * Las máquinas, los motivos y las fallas bajan a la tablet del taller, así que llevan `xid_escritura`. Una máquina tiene
 * a lo más una falla abierta: un único parcial lo cuida.
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
	smallint,
	text,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { columnasComunes, columnasDeBaja, columnaXidEscritura, momento, valores } from "../../nucleo/base/columnas.ts";
import { dispositivos, listaValores, usuarios } from "../admin/tablas.ts";
import { terceros } from "../contaduria/tablas.ts";
import { personas } from "../personal/tablas.ts";

/** De dónde llega una falla. */
export const origenesDeFalla = ["tablet", "mantenimiento"] as const;

/** Los estados de una falla. */
export const estadosDeFalla = ["reportada", "en_reparacion", "resuelta"] as const;

/** Los tipos de máquina, con el prefijo de los folios de sus máquinas. */
export const tiposMaquina = pgTable(
	"tipos_maquina",
	{
		id: uuid("id").primaryKey(),
		nombre: text("nombre").notNull(),
		prefijo: text("prefijo").notNull(),
		...columnasDeBaja(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("tipos_maquina_nombre").on(sql`lower(${tabla.nombre})`),
		uniqueIndex("tipos_maquina_prefijo").on(tabla.prefijo),
		check("tipos_maquina_prefijo_letras", sql`${tabla.prefijo} ~ '^[A-Z]{1,6}$'`),
	],
);

/** Los técnicos y talleres que reparan las máquinas. */
export const tecnicos = pgTable(
	"tecnicos",
	{
		id: uuid("id").primaryKey(),
		nombre: text("nombre").notNull(),
		terceroId: uuid("tercero_id").references(() => terceros.id),
		...columnasDeBaja(),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("tecnicos_nombre").on(sql`lower(${tabla.nombre})`),
		check("tecnicos_nombre_largo", sql`char_length(${tabla.nombre}) between 2 and 60`),
	],
);

/** Las máquinas del taller, con su folio por tipo y quién la trae. */
export const maquinas = pgTable(
	"maquinas",
	{
		id: uuid("id").primaryKey(),
		folio: text("folio").notNull(),
		nombre: text("nombre").notNull(),
		tipoMaquinaId: uuid("tipo_maquina_id")
			.notNull()
			.references(() => tiposMaquina.id),
		areaId: uuid("area_id")
			.notNull()
			.references(() => listaValores.id),
		marca: text("marca"),
		modelo: text("modelo"),
		serie: text("serie"),
		personaId: uuid("persona_id").references(() => personas.id),
		...columnasDeBaja(),
		...columnasComunes(),
		...columnaXidEscritura(),
	},
	(tabla) => [
		uniqueIndex("maquinas_folio").on(tabla.folio),
		uniqueIndex("maquinas_nombre").on(sql`lower(${tabla.nombre})`),
		uniqueIndex("maquinas_serie").on(tabla.serie).where(sql`${tabla.serie} is not null and ${tabla.serie} <> ''`),
		index("maquinas_persona").on(tabla.personaId),
		index("maquinas_xid_escritura").on(tabla.xidEscritura),
		check("maquinas_nombre_largo", sql`char_length(${tabla.nombre}) between 1 and 40`),
		check("maquinas_motivo_baja", sql`${tabla.bajaEn} is null or char_length(${tabla.motivoBaja}) >= 5`),
	],
);

/** Los motivos de falla: los botones de «¿Qué le pasa?», con si detienen la máquina. */
export const motivosFalla = pgTable(
	"motivos_falla",
	{
		id: uuid("id").primaryKey(),
		nombre: text("nombre").notNull(),
		detieneMaquina: boolean("detiene_maquina").notNull(),
		orden: smallint("orden").notNull(),
		...columnasDeBaja(),
		...columnasComunes(),
		...columnaXidEscritura(),
	},
	(tabla) => [
		uniqueIndex("motivos_falla_nombre").on(sql`lower(${tabla.nombre})`),
		index("motivos_falla_xid_escritura").on(tabla.xidEscritura),
	],
);

/** Las fallas FM- de las máquinas: llegan de la tablet o de Mantenimiento. */
export const fallas = pgTable(
	"fallas",
	{
		id: uuid("id").primaryKey(),
		folio: text("folio").notNull(),
		maquinaId: uuid("maquina_id")
			.notNull()
			.references(() => maquinas.id),
		motivoFallaId: uuid("motivo_falla_id")
			.notNull()
			.references(() => motivosFalla.id),
		nota: text("nota"),
		origen: text("origen", { enum: origenesDeFalla }).notNull(),
		reportoPersonaId: uuid("reporto_persona_id").references(() => personas.id),
		personaAsignadaId: uuid("persona_asignada_id").references(() => personas.id),
		dispositivoId: uuid("dispositivo_id").references((): AnyPgColumn => dispositivos.id),
		claveIdempotencia: uuid("clave_idempotencia"),
		hechoEn: momento("hecho_en").notNull(),
		fecha: date("fecha", { mode: "string" }).notNull(),
		sinInternet: boolean("sin_internet").notNull().default(false),
		detuvoMaquina: boolean("detuvo_maquina").notNull(),
		paradaDesde: momento("parada_desde"),
		estado: text("estado", { enum: estadosDeFalla }).notNull().default("reportada"),
		tecnicoId: uuid("tecnico_id").references(() => tecnicos.id),
		mandadaAReparacionEn: momento("mandada_a_reparacion_en"),
		mandadaPor: uuid("mandada_por").references(() => usuarios.id),
		notaSeguimiento: text("nota_seguimiento"),
		resueltaEn: momento("resuelta_en"),
		resueltaPor: uuid("resuelta_por").references(() => usuarios.id),
		...columnasComunes(),
		...columnaXidEscritura(),
	},
	(tabla) => [
		uniqueIndex("fallas_folio").on(tabla.folio),
		uniqueIndex("fallas_una_abierta").on(tabla.maquinaId).where(sql`${tabla.estado} <> 'resuelta'`),
		uniqueIndex("fallas_clave").on(tabla.claveIdempotencia).where(sql`${tabla.claveIdempotencia} is not null`),
		index("fallas_estado").on(tabla.estado),
		index("fallas_xid_escritura").on(tabla.xidEscritura),
		check("fallas_origen", sql`${tabla.origen} in (${valores(origenesDeFalla)})`),
		check(
			"fallas_tablet",
			sql`${tabla.origen} <> 'tablet' or (${tabla.reportoPersonaId} is not null and ${tabla.dispositivoId} is not null
				and ${tabla.claveIdempotencia} is not null)`,
		),
		check("fallas_estado", sql`${tabla.estado} in (${valores(estadosDeFalla)})`),
		check("fallas_parada", sql`not ${tabla.detuvoMaquina} or ${tabla.paradaDesde} is not null`),
		check("fallas_en_reparacion", sql`${tabla.estado} <> 'en_reparacion' or ${tabla.tecnicoId} is not null`),
		check(
			"fallas_resuelta",
			sql`(${tabla.estado} = 'resuelta') = (${tabla.resueltaEn} is not null and ${tabla.resueltaPor} is not null)`,
		),
		check("fallas_nota", sql`${tabla.nota} is null or char_length(${tabla.nota}) <= 200`),
		check(
			"fallas_nota_seguimiento",
			sql`${tabla.notaSeguimiento} is null or char_length(${tabla.notaSeguimiento}) <= 200`,
		),
	],
);

/** Los servicios SM-: resuelven una falla o se hacen sueltos. */
export const servicios = pgTable(
	"servicios",
	{
		id: uuid("id").primaryKey(),
		folio: text("folio").notNull(),
		maquinaId: uuid("maquina_id")
			.notNull()
			.references(() => maquinas.id),
		fallaId: uuid("falla_id").references(() => fallas.id),
		tecnicoId: uuid("tecnico_id")
			.notNull()
			.references(() => tecnicos.id),
		fecha: date("fecha", { mode: "string" }).notNull(),
		queSeHizo: text("que_se_hizo").notNull(),
		costoCentavos: bigint("costo_centavos", { mode: "number" }).notNull(),
		horasParo: integer("horas_paro").notNull(),
		/** @llavePendiente gastos.id */
		gastoId: uuid("gasto_id"),
		...columnasComunes(),
	},
	(tabla) => [
		uniqueIndex("servicios_folio").on(tabla.folio),
		uniqueIndex("servicios_falla").on(tabla.fallaId).where(sql`${tabla.fallaId} is not null`),
		index("servicios_maquina").on(tabla.maquinaId),
		check("servicios_que_se_hizo", sql`char_length(${tabla.queSeHizo}) between 4 and 80`),
		check("servicios_costo", sql`${tabla.costoCentavos} >= 0`),
		check("servicios_horas", sql`${tabla.horasParo} >= 0`),
		check("servicios_creado_por", sql`${tabla.creadoPor} is not null`),
	],
);
