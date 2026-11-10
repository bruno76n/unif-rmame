/**
 * `personal.resumen_pin`: los números del PIN del taller para la Asistencia de Personal.
 * Fase 7 · docs/modulos/personal/pin-del-taller.md («`personal.resumen_pin`»)
 *
 * Las personas activas, cuántas no tienen cuenta, las del Taller sin PIN (nombre y puesto), los PIN activos y
 * los bloqueados (nombre y desde cuándo). Nunca el PIN ni su hash.
 */

import { and, eq, inArray, isNull, notExists, sql } from "drizzle-orm";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { usuarios } from "../../admin/tablas.ts";
import { ubicacionDelPin } from "../dominio/pines.ts";
import { personas, pines } from "../tablas.ts";

/**
 * El resumen del PIN del taller.
 * @param contexto El contexto de quien lee.
 */
export async function resumenPin(contexto: ContextoDeAccion) {
	const { transaccion } = contexto;
	const ubicacionId = await ubicacionDelPin(transaccion);
	const conCuenta = transaccion
		.select({ id: usuarios.id })
		.from(usuarios)
		.where(and(eq(usuarios.personaId, personas.id), inArray(usuarios.estado, ["activa", "solicitada"])));
	const conPin = (estados: readonly string[]) =>
		transaccion
			.select({ id: pines.id })
			.from(pines)
			.where(
				and(eq(pines.personaId, personas.id), eq(pines.ubicacionId, ubicacionId), inArray(pines.estado, [...estados])),
			);
	const [cuentas] = await transaccion
		.select({
			activas: sql<number>`count(*)::int`,
			sinCuenta: sql<number>`count(*) filter (where not exists (${conCuenta}))::int`,
		})
		.from(personas)
		.where(isNull(personas.bajaEn));
	const sinPin = await transaccion
		.select({ persona_id: personas.id, nombre: personas.nombre, puesto: personas.puesto })
		.from(personas)
		.where(
			and(
				isNull(personas.bajaEn),
				eq(personas.area, "taller"),
				notExists(conCuenta),
				notExists(conPin(["activo", "bloqueado"])),
			),
		)
		.orderBy(personas.nombre);
	const vivos = await transaccion
		.select({ persona_id: personas.id, nombre: personas.nombre, estado: pines.estado, desde: pines.bloqueadoEn })
		.from(pines)
		.innerJoin(personas, eq(personas.id, pines.personaId))
		.where(and(eq(pines.ubicacionId, ubicacionId), inArray(pines.estado, ["activo", "bloqueado"])))
		.orderBy(personas.nombre);
	return {
		personas_activas: cuentas?.activas ?? 0,
		sin_cuenta: cuentas?.sinCuenta ?? 0,
		sin_pin: sinPin,
		pines_activos: vivos.filter((vivo) => vivo.estado === "activo").length,
		bloqueados: vivos
			.filter((vivo) => vivo.estado === "bloqueado")
			.map((vivo) => ({ persona_id: vivo.persona_id, nombre: vivo.nombre, desde: vivo.desde })),
	};
}
