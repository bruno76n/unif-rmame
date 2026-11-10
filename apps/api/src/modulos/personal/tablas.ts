/**
 * Las tablas de `personal`: las personas (E-) y su PIN del taller.
 * Fase 7 · docs/modulos/personal/personas.md («La tabla `personas`»)
 *
 * Una persona no necesita cuenta. Baja a la tablet (si tiene PIN del Taller), así que lleva `xid_escritura`;
 * su PIN también (solo su hash), con todos sus estados.
 */

import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	bigint,
	check,
	date,
	index,
	pgTable,
	smallint,
	text,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { columnasComunes, columnaXidEscritura, momento } from "../../nucleo/base/columnas.ts";
import { usuarios } from "../admin/tablas.ts";
import { ubicaciones } from "../inventario/tablas.ts";

/** Quien trabaja en la fábrica o en las tiendas, tenga o no cuenta. */
export const personas = pgTable(
	"personas",
	{
		id: uuid("id").primaryKey(),
		folio: text("folio").notNull(),
		nombre: text("nombre").notNull(),
		area: text("area").notNull(),
		ubicacionId: uuid("ubicacion_id").references((): AnyPgColumn => ubicaciones.id),
		rolTienda: text("rol_tienda"),
		puesto: text("puesto").notNull(),
		formaPago: text("forma_pago").notNull(),
		pagoDiaCentavos: bigint("pago_dia_centavos", { mode: "number" }),
		fechaIngreso: date("fecha_ingreso", { mode: "string" }).notNull(),
		bajaEn: momento("baja_en"),
		bajaPor: uuid("baja_por").references((): AnyPgColumn => usuarios.id),
		motivoBaja: text("motivo_baja"),
		reactivadoEn: momento("reactivado_en"),
		reactivadoPor: uuid("reactivado_por").references((): AnyPgColumn => usuarios.id),
		...columnasComunes(),
		...columnaXidEscritura(),
	},
	(tabla) => [
		uniqueIndex("personas_folio").on(tabla.folio),
		index("personas_area").on(tabla.area, tabla.ubicacionId).where(sql`${tabla.bajaEn} is null`),
		index("personas_xid_escritura").on(tabla.xidEscritura),
		check("personas_nombre", sql`char_length(${tabla.nombre}) between 5 and 40`),
		check("personas_area", sql`${tabla.area} in ('taller', 'oficina', 'aduana_bodega', 'tienda')`),
		check(
			"personas_tienda",
			sql`(${tabla.area} = 'tienda') = (${tabla.ubicacionId} is not null and ${tabla.rolTienda} is not null) and (${tabla.area} = 'tienda' or (${tabla.ubicacionId} is null and ${tabla.rolTienda} is null))`,
		),
		check("personas_rol_tienda", sql`${tabla.rolTienda} is null or ${tabla.rolTienda} in ('cajera', 'encargada')`),
		check("personas_puesto", sql`char_length(${tabla.puesto}) between 3 and 30`),
		check("personas_forma_pago", sql`${tabla.formaPago} in ('tiempo', 'pieza', 'mixta')`),
		check(
			"personas_pago_dia",
			sql`(${tabla.formaPago} = 'pieza' and ${tabla.pagoDiaCentavos} is null) or (${tabla.formaPago} <> 'pieza' and ${tabla.pagoDiaCentavos} between 1 and 9999900)`,
		),
		check("personas_baja", sql`${tabla.bajaEn} is null or char_length(${tabla.motivoBaja}) between 5 and 80`),
	],
);

/** El PIN de 4 cifras con que una persona del Taller entra a la tablet: aquí solo su hash Argon2id. */
export const pines = pgTable(
	"pines",
	{
		id: uuid("id").primaryKey(),
		personaId: uuid("persona_id")
			.notNull()
			.references(() => personas.id),
		ubicacionId: uuid("ubicacion_id")
			.notNull()
			.references((): AnyPgColumn => ubicaciones.id),
		pinHash: text("pin_hash").notNull(),
		estado: text("estado").notNull().default("activo"),
		intentosFallidos: smallint("intentos_fallidos").notNull().default(0),
		bloqueadoEn: momento("bloqueado_en"),
		desbloqueadoEn: momento("desbloqueado_en"),
		desbloqueadoPor: uuid("desbloqueado_por").references((): AnyPgColumn => usuarios.id),
		anuladoEn: momento("anulado_en"),
		anuladoPor: uuid("anulado_por").references((): AnyPgColumn => usuarios.id),
		motivoAnulacion: text("motivo_anulacion"),
		...columnasComunes(),
		...columnaXidEscritura(),
	},
	(tabla) => [
		uniqueIndex("pines_uno_vivo")
			.on(tabla.personaId, tabla.ubicacionId)
			.where(sql`${tabla.estado} in ('activo', 'bloqueado')`),
		index("pines_xid_escritura").on(tabla.xidEscritura),
		check("pines_estado", sql`${tabla.estado} in ('activo', 'bloqueado', 'anulado')`),
		check(
			"pines_anulacion",
			sql`(${tabla.estado} = 'anulado') = (${tabla.anuladoEn} is not null and ${tabla.motivoAnulacion} is not null)`,
		),
		check(
			"pines_motivo",
			sql`${tabla.motivoAnulacion} is null or ${tabla.motivoAnulacion} in ('restablecido', 'baja_persona', 'cuenta_google', 'cambio_area')`,
		),
	],
);
