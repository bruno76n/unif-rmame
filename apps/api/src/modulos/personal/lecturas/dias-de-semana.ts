/**
 * `personal.dias_de_semana`: los días de asistencia de una persona en la semana que corre.
 * Fase 7 · docs/modulos/personal/asistencia.md («`personal.dias_de_semana`»)
 */

import { inicioDeSemana } from "@uniformame/compartido/calculos/fechas";
import { and, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { diasDeSemanaGuardada, diasDeTrabajo, semanaDe } from "../dominio/asistencia.ts";
import { asistenciaDias, asistenciaSemanas } from "../tablas.ts";

/** Lo que recibe. */
const pedido = z.object({ persona_id: z.uuid() });

/**
 * Los días de la persona en la semana que corre.
 * @param contexto El contexto de la acción.
 * @param datos `persona_id`.
 * @returns La semana (su inicio, su fin y su estado, o `null` si no se ha abierto) y, por cada día de
 * trabajo, su valor o `null` si está sin capturar.
 */
export async function diasDeSemana(contexto: ContextoDeAccion, datos: unknown) {
	const { persona_id } = pedido.parse(datos);
	const dias = await diasDeTrabajo(contexto);
	const lunes = inicioDeSemana(contexto.diaDeNegocio);
	// La semana guardada de esta semana de lunes a domingo, si ya se abrió; si no, la de los días de hoy.
	const [abierta] = await contexto.transaccion
		.select()
		.from(asistenciaSemanas)
		.where(
			and(
				gte(asistenciaSemanas.fechaInicio, lunes.toString()),
				lte(asistenciaSemanas.fechaInicio, lunes.add({ days: 6 }).toString()),
			),
		);
	const semana =
		abierta === undefined
			? semanaDe(contexto.diaDeNegocio, dias)
			: diasDeSemanaGuardada(abierta.fechaInicio, abierta.fechaFin, dias);
	const capturados = await contexto.transaccion
		.select({ fecha: asistenciaDias.fecha, valor: asistenciaDias.valor })
		.from(asistenciaDias)
		.where(
			and(
				eq(asistenciaDias.personaId, persona_id),
				gte(asistenciaDias.fecha, semana.inicio.toString()),
				lte(asistenciaDias.fecha, semana.fin.toString()),
			),
		);
	const porFecha = new Map(capturados.map((dia) => [dia.fecha, dia.valor]));
	return {
		inicio: semana.inicio.toString(),
		fin: semana.fin.toString(),
		estado: abierta?.estado ?? null,
		dias: semana.dias.map((fecha) => ({ fecha: fecha.toString(), valor: porFecha.get(fecha.toString()) ?? null })),
	};
}
