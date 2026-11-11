/**
 * Lo que comparten las acciones de los flujos: las operaciones vigentes de un flujo, la operación del catálogo por su
 * nombre y la persona de base.
 * Fase 12 · docs/modulos/produccion/operaciones-y-flujos.md (reglas 1, 3 y 9)
 */

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { personas } from "../../personal/tablas.ts";
import { flujoOperaciones, operaciones } from "../tablas.ts";

/** Una operación vigente de un flujo, con su nombre. */
export interface OperacionDelFlujo {
	flujoOperacionId: string;
	operacionId: string;
	nombre: string;
	esCorte: boolean;
	orden: number;
	personaBaseId: string;
}

/**
 * Las operaciones vigentes de un flujo, en su orden.
 * @param contexto El contexto de la acción.
 * @param flujoId El flujo.
 */
export function operacionesDelFlujo(contexto: ContextoDeAccion, flujoId: string): Promise<OperacionDelFlujo[]> {
	return contexto.transaccion
		.select({
			flujoOperacionId: flujoOperaciones.id,
			operacionId: flujoOperaciones.operacionId,
			nombre: operaciones.nombre,
			esCorte: operaciones.esCorte,
			orden: flujoOperaciones.orden,
			personaBaseId: flujoOperaciones.personaBaseId,
		})
		.from(flujoOperaciones)
		.innerJoin(operaciones, eq(operaciones.id, flujoOperaciones.operacionId))
		.where(and(eq(flujoOperaciones.flujoId, flujoId), isNull(flujoOperaciones.bajaEn)))
		.orderBy(asc(flujoOperaciones.orden));
}

/** Cómo va la lista de operaciones de un flujo en la bitácora: su nombre y su orden. */
export function listaParaBitacora(lista: readonly OperacionDelFlujo[]) {
	return lista.map((suya) => ({ operacion: suya.nombre, orden: suya.orden, persona_base_id: suya.personaBaseId }));
}

/**
 * La operación del catálogo con ese nombre, sin importar mayúsculas; si no existe, nace con ese nombre (regla 1).
 * @param contexto El contexto de la acción.
 * @param nombre El nombre de la operación.
 * @returns Su id, su nombre como está en el catálogo y si es el corte.
 */
export async function operacionPorNombre(
	contexto: ContextoDeAccion,
	nombre: string,
): Promise<{ id: string; nombre: string; esCorte: boolean }> {
	const { transaccion } = contexto;
	// Si dos la crean a la vez, el único del nombre deja a una; la otra la lee después.
	await transaccion
		.insert(operaciones)
		.values({ id: uuidv7(), nombre, creadoPor: quienCambia(contexto) })
		.onConflictDoNothing();
	const [suya] = await transaccion
		.select({ id: operaciones.id, nombre: operaciones.nombre, esCorte: operaciones.esCorte })
		.from(operaciones)
		.where(sql`lower(${operaciones.nombre}) = lower(${nombre})`);
	if (suya === undefined) throw new Error(`no quedó la operación ${nombre}`);
	return suya;
}

/** La operación de corte, que siembra el sistema. */
export async function operacionDeCorte(contexto: ContextoDeAccion): Promise<{ id: string; nombre: string }> {
	const [corte] = await contexto.transaccion
		.select({ id: operaciones.id, nombre: operaciones.nombre })
		.from(operaciones)
		.where(eq(operaciones.esCorte, true));
	if (corte === undefined) throw new Error("falta la operación de corte de la siembra");
	return corte;
}

/**
 * Revisa que quien hace una operación sea una persona activa del Taller; la bloquea para que no se dé de baja mientras.
 * @param contexto El contexto de la acción.
 * @param personaId La persona.
 * @throws `422 persona_no_valida`: «¿Quién la hace?».
 */
export async function revisarPersonaDelTaller(contexto: ContextoDeAccion, personaId: string): Promise<void> {
	const [persona] = await contexto.transaccion
		.select({ area: personas.area, bajaEn: personas.bajaEn })
		.from(personas)
		.where(eq(personas.id, personaId))
		.for("share");
	if (persona === undefined || persona.area !== "taller" || persona.bajaEn !== null) {
		throw errorDeRegla("persona_no_valida", "¿Quién la hace?");
	}
}
