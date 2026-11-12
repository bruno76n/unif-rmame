/**
 * Las lecturas de Personal para la nómina de Contaduría: la asistencia de una semana con sus días contados, y la ficha
 * de cada persona con su forma de pago y su pago por día.
 * Fase 17 · docs/modulos/personal/asistencia.md («`personal.asistencia_para_nomina(semana)`») y personas.md
 * («`personal.fichas_para_nomina(personas)`»)
 *
 * Llevan sueldos: solo las lee Contaduría, que las pide con «ven sueldos y tarifas».
 */

import { zonaDelNegocio } from "@uniformame/compartido/calculos/fechas";
import { and, asc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { diaDeBaja, formasConAsistencia } from "../dominio/asistencia.ts";
import { asistenciaDias, asistenciaSemanas, personas } from "../tablas.ts";

/** Lo que vale cada día capturado (regla 3 de la asistencia). */
const valorDelDia: Readonly<Record<string, number>> = { completo: 1, medio: 0.5, falta: 0 };

/** Lo que recibe `personal.asistencia_para_nomina`. */
const deUnaSemana = z.object({ asistencia_semana_id: z.uuid() }).strict();

/**
 * `personal.asistencia_para_nomina`: la semana (su inicio, su fin y si está cerrada), las semanas anteriores que
 * siguen abiertas, y cada persona que lleva asistencia en ella (cobra por tiempo o mixta, activa en la semana o dada
 * de baja dentro de ella) con sus días contados, solo entre su ingreso y su baja.
 * @param contexto El contexto de quien lee (Contaduría).
 * @param datos `asistencia_semana_id`.
 * @throws `404` si la semana no existe.
 */
export async function asistenciaParaNomina(contexto: ContextoDeAccion, datos: unknown) {
	const { asistencia_semana_id } = deUnaSemana.parse(datos);
	const { transaccion } = contexto;
	const [semana] = await transaccion
		.select()
		.from(asistenciaSemanas)
		.where(eq(asistenciaSemanas.id, asistencia_semana_id));
	if (semana === undefined) throw noExiste();
	const anteriores = await transaccion
		.select({ id: asistenciaSemanas.id, inicio: asistenciaSemanas.fechaInicio, fin: asistenciaSemanas.fechaFin })
		.from(asistenciaSemanas)
		.where(and(lt(asistenciaSemanas.fechaInicio, semana.fechaInicio), eq(asistenciaSemanas.estado, "abierta")))
		.orderBy(asc(asistenciaSemanas.fechaInicio));
	const quienes = await transaccion
		.select({ id: personas.id, ingreso: personas.fechaIngreso, bajaEn: personas.bajaEn })
		.from(personas)
		.where(
			and(
				inArray(personas.formaPago, formasConAsistencia),
				lte(personas.fechaIngreso, semana.fechaFin),
				or(
					isNull(personas.bajaEn),
					gte(sql`(${personas.bajaEn} at time zone ${zonaDelNegocio})::date`, semana.fechaInicio),
				),
			),
		)
		.orderBy(asc(personas.id));
	const dias =
		quienes.length === 0
			? []
			: await transaccion
					.select({ personaId: asistenciaDias.personaId, fecha: asistenciaDias.fecha, valor: asistenciaDias.valor })
					.from(asistenciaDias)
					.where(
						and(
							inArray(
								asistenciaDias.personaId,
								quienes.map((quien) => quien.id),
							),
							gte(asistenciaDias.fecha, semana.fechaInicio),
							lte(asistenciaDias.fecha, semana.fechaFin),
						),
					);
	return {
		semana: {
			asistencia_semana_id: semana.id,
			inicio: semana.fechaInicio,
			fin: semana.fechaFin,
			cerrada: semana.estado === "cerrada",
		},
		abiertas_anteriores: anteriores,
		personas: quienes.map((quien) => {
			const baja = diaDeBaja(quien.bajaEn);
			const suyos = dias.filter(
				(dia) =>
					dia.personaId === quien.id &&
					Temporal.PlainDate.compare(dia.fecha, quien.ingreso) >= 0 &&
					(baja === undefined || Temporal.PlainDate.compare(dia.fecha, baja) <= 0),
			);
			return {
				persona_id: quien.id,
				dias: suyos.reduce((suma, dia) => suma + (valorDelDia[dia.valor] ?? 0), 0),
			};
		}),
	};
}

/** Lo que recibe `personal.fichas_para_nomina`. */
const dePersonas = z.object({ persona_ids: z.array(z.uuid()) }).strict();

/**
 * `personal.fichas_para_nomina`: por persona, su nombre, su área y su tienda, su puesto, su forma de pago, su pago por
 * día, su ingreso y su baja (el día, en hora de México). Lleva sueldos.
 * @param contexto El contexto de quien lee (Contaduría).
 * @param datos `persona_ids`.
 */
export async function fichasParaNomina(contexto: ContextoDeAccion, datos: unknown) {
	const { persona_ids } = dePersonas.parse(datos);
	if (persona_ids.length === 0) return { fichas: [] };
	const filas = await contexto.transaccion
		.select()
		.from(personas)
		.where(inArray(personas.id, persona_ids))
		.orderBy(asc(personas.nombre), asc(personas.id));
	return {
		fichas: filas.map((persona) => ({
			persona_id: persona.id,
			nombre: persona.nombre,
			area: persona.area,
			ubicacion_id: persona.ubicacionId,
			puesto: persona.puesto,
			forma_pago: persona.formaPago,
			pago_dia_centavos: persona.pagoDiaCentavos,
			fecha_ingreso: persona.fechaIngreso,
			baja_en: diaDeBaja(persona.bajaEn)?.toString() ?? null,
		})),
	};
}
