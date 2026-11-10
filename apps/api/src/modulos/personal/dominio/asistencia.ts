/**
 * Lo que comparten la asistencia y su trabajo: los días de trabajo, la semana de un día, abrirla, nombrarla y
 * los días que se exigen para cerrarla.
 * Fase 7 · docs/modulos/personal/asistencia.md (reglas 1 a 4, «Trabajos»)
 *
 * La semana son los días de `general.dias_de_trabajo` de la semana de lunes a domingo: empieza en el primero
 * y termina en el último.
 */

import {
	type DiaDeLaSemana,
	diaDeNegocio,
	inicioDeSemana,
	zonaDelNegocio,
} from "@uniformame/compartido/calculos/fechas";
import { and, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { asistenciaDias, asistenciaSemanas, personas } from "../tablas.ts";

/** Las formas de pago que llevan asistencia. */
export const formasConAsistencia = ["tiempo", "mixta"];

/** Un día de la semana, del 1 (lunes) al 7 (domingo). */
const diaDeLaSemana = z.union([
	z.literal(1),
	z.literal(2),
	z.literal(3),
	z.literal(4),
	z.literal(5),
	z.literal(6),
	z.literal(7),
]);

/**
 * Lee el valor de `general.dias_de_trabajo` («1,2,3,4,5,6»): los días, sin repetir y en orden.
 * @param valor El valor del parámetro.
 */
export function leerDiasDeTrabajo(valor: unknown): DiaDeLaSemana[] {
	const dias = z
		.string()
		.parse(valor)
		.split(",")
		.map((dia) => diaDeLaSemana.parse(Number(dia.trim())));
	return [...new Set(dias)].sort((uno, otro) => uno - otro);
}

/**
 * Los días de trabajo, dentro de una acción.
 * @param contexto El contexto de la acción.
 */
export async function diasDeTrabajo(contexto: ContextoDeAccion): Promise<DiaDeLaSemana[]> {
	return leerDiasDeTrabajo(await contexto.lectura("admin.parametro", { clave: "general.dias_de_trabajo" }));
}

/** Una semana de asistencia: su inicio, su fin y sus días de trabajo. */
export interface DiasDeLaSemana {
	inicio: Temporal.PlainDate;
	fin: Temporal.PlainDate;
	dias: Temporal.PlainDate[];
}

/**
 * La semana de un día: los días de trabajo de su semana de lunes a domingo.
 * @param fecha Cualquier día de la semana.
 * @param dias Los días de trabajo.
 */
export function semanaDe(fecha: Temporal.PlainDate, dias: readonly DiaDeLaSemana[]): DiasDeLaSemana {
	const lunes = inicioDeSemana(fecha);
	const deLaSemana = dias.map((dia) => lunes.add({ days: dia - 1 }));
	const [inicio] = deLaSemana;
	const fin = deLaSemana.at(-1);
	if (inicio === undefined || fin === undefined) throw new Error("no hay días de trabajo");
	return { inicio, fin, dias: deLaSemana };
}

/**
 * La semana guardada de la semana de lunes a domingo de un día, o la abre si todavía no existe (el trabajo,
 * o la primera captura si el trabajo no la abrió). Se busca por su semana de lunes a domingo, no por el
 * inicio de hoy: si la dueña cambia `general.dias_de_trabajo`, la semana ya guardada sigue siendo la misma
 * y nunca se encima otra (la base no deja dos en la misma semana de lunes a domingo). Sus días son los de
 * trabajo de hoy dentro de esa semana (`semanaDe` con su inicio).
 * @param transaccion La transacción.
 * @param semana La semana como la dan los días de trabajo de hoy.
 * @param creadoPor Quién la abre (nulo si es el trabajo).
 * @returns Su renglón, bloqueado para compartir: nadie la cierra mientras tanto.
 */
export async function abrirSemana(transaccion: Transaccion, semana: DiasDeLaSemana, creadoPor: string | null) {
	const lunes = inicioDeSemana(semana.inicio);
	const deEsaSemana = and(
		gte(asistenciaSemanas.fechaInicio, lunes.toString()),
		lte(asistenciaSemanas.fechaInicio, lunes.add({ days: 6 }).toString()),
	);
	const leer = async () => {
		const [guardada] = await transaccion
			.select()
			.from(asistenciaSemanas)
			.where(deEsaSemana)
			.orderBy(asistenciaSemanas.fechaInicio)
			.limit(1)
			.for("share");
		return guardada;
	};
	const guardada = await leer();
	if (guardada !== undefined) return guardada;
	await transaccion
		.insert(asistenciaSemanas)
		.values({
			id: uuidv7(),
			fechaInicio: semana.inicio.toString(),
			fechaFin: semana.fin.toString(),
			creadoPor,
		})
		.onConflictDoNothing();
	const abierta = await leer();
	if (abierta === undefined) throw new Error(`no se abrió la semana del ${semana.inicio.toString()}`);
	return abierta;
}

/** Cómo se escribe un día en los mensajes: «2 de noviembre». */
export function textoDeDia(fecha: Temporal.PlainDate | string): string {
	return Temporal.PlainDate.from(fecha).toLocaleString("es-MX", { day: "numeric", month: "long" });
}

/**
 * Cómo se nombra una semana en los mensajes: «2 al 7 de noviembre» (o «30 de octubre al 4 de noviembre»).
 * @param inicio Su primer día.
 * @param fin Su último día.
 */
export function textoDeSemana(inicio: string, fin: string): string {
	const desde = Temporal.PlainDate.from(inicio);
	const hasta = Temporal.PlainDate.from(fin);
	const primero = desde.month === hasta.month ? String(desde.day) : textoDeDia(desde);
	return `${primero} al ${textoDeDia(hasta)}`;
}

/**
 * El último día en que una persona dada de baja cuenta: el de su baja, en hora de México.
 * @param bajaEn Cuándo se dio de baja, o nulo.
 */
export function diaDeBaja(bajaEn: string | null): Temporal.PlainDate | undefined {
	return bajaEn === null ? undefined : diaDeNegocio(Temporal.Instant.from(new Date(bajaEn).toISOString()));
}

/** Un día exigido que falta por capturar. */
export interface DiaSinCapturar {
	personaId: string;
	nombre: string;
	fecha: Temporal.PlainDate;
}

/**
 * Los días exigidos que faltan por capturar (regla 4): por cada persona que cobra por tiempo o mixto, activa
 * en la semana o dada de baja dentro de ella, cada día de trabajo entre su ingreso y su baja.
 * @param transaccion La transacción.
 * @param semana La semana, con sus días de trabajo.
 * @returns Los que faltan, persona por persona (por nombre) y en cada una sus días.
 */
export async function diasSinCapturar(transaccion: Transaccion, semana: DiasDeLaSemana): Promise<DiaSinCapturar[]> {
	const inicio = semana.inicio.toString();
	const fin = semana.fin.toString();
	const quienes = await transaccion
		.select({ id: personas.id, nombre: personas.nombre, ingreso: personas.fechaIngreso, bajaEn: personas.bajaEn })
		.from(personas)
		.where(
			and(
				inArray(personas.formaPago, formasConAsistencia),
				lte(personas.fechaIngreso, fin),
				or(isNull(personas.bajaEn), gte(sql`(${personas.bajaEn} at time zone ${zonaDelNegocio})::date`, inicio)),
			),
		)
		.orderBy(personas.nombre, personas.id);
	if (quienes.length === 0) return [];
	const capturados = await transaccion
		.select({ personaId: asistenciaDias.personaId, fecha: asistenciaDias.fecha })
		.from(asistenciaDias)
		.where(
			and(
				inArray(
					asistenciaDias.personaId,
					quienes.map((quien) => quien.id),
				),
				gte(asistenciaDias.fecha, inicio),
				lte(asistenciaDias.fecha, fin),
			),
		);
	const yaEstan = new Set(capturados.map((dia) => `${dia.personaId}|${dia.fecha}`));
	// En el orden de la cuadrícula: persona por persona, y en cada una sus días.
	return quienes.flatMap((quien) => {
		const baja = diaDeBaja(quien.bajaEn);
		return semana.dias
			.filter(
				(fecha) =>
					Temporal.PlainDate.compare(fecha, quien.ingreso) >= 0 &&
					(baja === undefined || Temporal.PlainDate.compare(fecha, baja) <= 0) &&
					!yaEstan.has(`${quien.id}|${fecha.toString()}`),
			)
			.map((fecha) => ({ personaId: quien.id, nombre: quien.nombre, fecha }));
	});
}
