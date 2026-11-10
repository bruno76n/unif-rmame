/**
 * Las tablas del módulo `admin` que ya existen.
 * Fase 3 · docs/cimientos/IDEMPOTENCIA-Y-CONCURRENCIA.md («La tabla `comandos_recibidos`»)
 *
 * `comandos_recibidos` es de `admin`, pero nace en la fase 3 porque la idempotencia la necesita. Es una
 * tabla técnica: no lleva las columnas comunes. Sus columnas que apuntan a tablas de fases posteriores
 * llevan su `@llavePendiente`.
 */

import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

/** Un momento: `timestamptz`. */
function momento(nombre: string) {
	return timestamp(nombre, { withTimezone: true, mode: "string" });
}

/** Cada acción que llegó, de la web, de un aparato o de uniformame.mx: hace que un reintento nunca duplique. */
export const comandosRecibidos = pgTable(
	"comandos_recibidos",
	{
		id: uuid("id").primaryKey(),
		claveIdempotencia: uuid("clave_idempotencia").notNull(),
		origen: text("origen").notNull(),
		/** @llavePendiente dispositivos.id */
		dispositivoId: uuid("dispositivo_id"),
		/** @llavePendiente usuarios.id */
		usuarioId: uuid("usuario_id"),
		/** @llavePendiente sesiones.id */
		sesionId: uuid("sesion_id"),
		/** @llavePendiente personas.id */
		personaId: uuid("persona_id"),
		tipoComando: text("tipo_comando").notNull(),
		ocurridoEn: momento("ocurrido_en").notNull(),
		recibidoEn: momento("recibido_en").notNull().defaultNow(),
		cargaHash: text("carga_hash").notNull(),
		carga: jsonb("carga"),
		resultado: text("resultado").notNull(),
		motivoApartado: text("motivo_apartado"),
		esperaEntidadId: uuid("espera_entidad_id"),
		dispositivoRevocado: boolean("dispositivo_revocado").notNull().default(false),
		/** @llavePendiente excepciones.id */
		excepcionId: uuid("excepcion_id"),
		entidad: text("entidad"),
		entidadId: uuid("entidad_id"),
		respuesta: jsonb("respuesta"),
		reintentos: integer("reintentos").notNull().default(0),
		ultimoReintentoEn: momento("ultimo_reintento_en"),
		descartadoEn: momento("descartado_en"),
		/** @llavePendiente usuarios.id */
		descartadoPor: uuid("descartado_por"),
		motivoDescarte: text("motivo_descarte"),
		retenidoAplicadoEn: momento("retenido_aplicado_en"),
		/** @llavePendiente usuarios.id */
		retenidoAplicadoPor: uuid("retenido_aplicado_por"),
		actualizadoEn: momento("actualizado_en"),
	},
	(tabla) => [
		uniqueIndex("comandos_recibidos_clave_idempotencia").on(tabla.claveIdempotencia),
		index("comandos_recibidos_dispositivo").on(tabla.dispositivoId, tabla.recibidoEn.desc()),
		index("comandos_recibidos_apartados")
			.on(tabla.recibidoEn)
			.where(sql`${tabla.resultado} = 'apartado' and ${tabla.descartadoEn} is null`),
		index("comandos_recibidos_espera").on(tabla.esperaEntidadId).where(sql`${tabla.esperaEntidadId} is not null`),
		check("comandos_recibidos_origen", sql`${tabla.origen} in ('web', 'aparato', 'linea')`),
		check("comandos_recibidos_resultado", sql`${tabla.resultado} in ('aplicado', 'excepcion', 'apartado')`),
		check(
			"comandos_recibidos_dispositivo_obligatorio",
			sql`${tabla.origen} = 'web' or ${tabla.dispositivoId} is not null`,
		),
		check(
			"comandos_recibidos_cuenta_obligatoria",
			sql`${tabla.origen} <> 'web' or (${tabla.usuarioId} is not null and ${tabla.sesionId} is not null)`,
		),
		check(
			"comandos_recibidos_motivo_apartado",
			sql`${tabla.resultado} <> 'apartado' or ${tabla.motivoApartado} is not null`,
		),
	],
);
