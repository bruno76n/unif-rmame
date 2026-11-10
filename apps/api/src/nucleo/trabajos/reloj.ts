/**
 * El reloj de los trabajos programados: la tarea `reloj`, que Graphile Worker corre cada minuto.
 * Fase 4 · docs/cimientos/EVENTOS-Y-TRABAJOS.md («Los trabajos programados»)
 *
 * En cada vuelta lee el horario de cada trabajo (de sus parámetros, así que un cambio vale desde la
 * siguiente vuelta), ve en hora de México si ya le toca y, si su vuelta de ese periodo no ha terminado, lo
 * encola en su propia cola con la clave del periodo (`admin.respaldo_semanal:2026-11-09`). Además deja
 * listas las particiones de los meses que vienen, vuelve a encolar la bandeja si hay reintentos vencidos y
 * revisa si el tope de la sincronización está detenido.
 */

import { zonaDelNegocio } from "@uniformame/compartido/calculos/fechas";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { eventos, trabajosVueltas } from "../../modulos/admin/tablas.ts";
import { enTransaccion } from "../base/transacciones.ts";
import type { ContextoDeTrabajo, Horario, Trabajo } from "../modulos.ts";
import { encolar } from "./encolar.ts";
import { listosParaProcesar } from "./procesar-eventos.ts";
import { revisarTopeDetenido } from "./tope-detenido.ts";

/** Cuántos meses adelante quedan listas las particiones. */
const mesesDeParticionesAdelante = 2;

/** Las tablas partidas por mes. */
export const tablasPartidas = ["eventos", "bitacora"] as const;

/**
 * El momento en que toca un horario dentro de su periodo, y el nombre de ese periodo.
 * @param horario El horario del trabajo.
 * @param ahora La hora de la vuelta.
 * @returns El periodo (`2026-11-09`, la semana por su lunes, `2026-11` o `2026-11-09T14:30`) si ya le
 * toca, o `undefined` si todavía no.
 */
export function vueltaQueToca(horario: Horario, ahora: Temporal.Instant): string | undefined {
	const local = ahora.toZonedDateTimeISO(zonaDelNegocio).toPlainDateTime();
	const fecha = local.toPlainDate();
	if (horario.cada === "minutos") {
		const minuto = Math.floor((local.hour * 60 + local.minute) / horario.minutos) * horario.minutos;
		return fecha
			.toPlainDateTime({ hour: Math.floor(minuto / 60), minute: minuto % 60 })
			.toString()
			.slice(0, 16);
	}
	const hora = Temporal.PlainTime.from(horario.hora);
	if (horario.cada === "dia") return yaToca(local, fecha.toPlainDateTime(hora), fecha.toString());
	if (horario.cada === "semana") {
		const lunes = fecha.subtract({ days: fecha.dayOfWeek - 1 });
		return yaToca(local, lunes.add({ days: horario.dia - 1 }).toPlainDateTime(hora), lunes.toString());
	}
	const dia = fecha.with({ day: Math.min(horario.dia, fecha.daysInMonth) });
	return yaToca(local, dia.toPlainDateTime(hora), fecha.toPlainYearMonth().toString());
}

/** El periodo si la hora local ya llegó a la que toca. */
function yaToca(local: Temporal.PlainDateTime, toca: Temporal.PlainDateTime, periodo: string): string | undefined {
	return Temporal.PlainDateTime.compare(local, toca) >= 0 ? periodo : undefined;
}

/**
 * Una vuelta del reloj.
 * @param trabajos Los trabajos registrados por los módulos.
 * @param contexto El contexto de la vuelta: la base y la hora.
 */
export async function correrReloj(trabajos: Iterable<Trabajo>, contexto: ContextoDeTrabajo): Promise<void> {
	const ahora = contexto.ahora.toString();
	// Las particiones van aparte: si una no se puede crear (la de respaldo ya tiene renglones de ese mes),
	// se avisa a soporte y el reloj sigue encolando la bandeja y los trabajos.
	for (const tabla of tablasPartidas) {
		try {
			await contexto.base.execute(
				sql`SELECT asegurar_particiones(${`public.${tabla}`}::regclass, ${mesesDeParticionesAdelante})`,
			);
		} catch (error) {
			await contexto.avisarFalla(
				`Crear las particiones de ${tabla}`,
				error instanceof Error ? error.message : String(error),
			);
		}
	}
	await enTransaccion(contexto.base, async (transaccion) => {
		const [vencido] = await transaccion
			.select({ id: eventos.id })
			.from(eventos)
			.where(listosParaProcesar(ahora))
			.limit(1);
		if (vencido !== undefined) {
			await encolar(transaccion, { tarea: "procesar_eventos", cola: "procesar_eventos", clave: "procesar_eventos" });
		}
	});
	// El tope seguro de la sincronización: si una transacción abierta lo frena, avisa a soporte.
	try {
		await revisarTopeDetenido(contexto);
	} catch (error) {
		await contexto.avisarFalla(
			"Revisar el tope de la sincronización",
			error instanceof Error ? error.message : String(error),
		);
	}
	for (const trabajo of trabajos) {
		const horario = trabajo.horario === undefined ? undefined : await trabajo.horario(contexto);
		const periodo = horario === undefined ? undefined : vueltaQueToca(horario, contexto.ahora);
		if (periodo !== undefined) await encolarVuelta(contexto, trabajo.nombre, periodo);
	}
}

/**
 * Encola la vuelta de un trabajo en su periodo, si no ha terminado. Una vuelta pendiente no se duplica
 * (misma clave, misma hora), y una que falló se vuelve a encolar aquí, en la siguiente vuelta del reloj.
 */
async function encolarVuelta(contexto: ContextoDeTrabajo, trabajo: string, periodo: string): Promise<void> {
	await enTransaccion(contexto.base, async (transaccion) => {
		const vuelta = and(eq(trabajosVueltas.trabajo, trabajo), eq(trabajosVueltas.periodo, periodo));
		const [terminada] = await transaccion
			.select({ trabajo: trabajosVueltas.trabajo })
			.from(trabajosVueltas)
			.where(and(vuelta, isNotNull(trabajosVueltas.terminadoEn)));
		if (terminada !== undefined) return;
		await transaccion.insert(trabajosVueltas).values({ trabajo, periodo }).onConflictDoNothing();
		await encolar(transaccion, {
			tarea: trabajo,
			cola: trabajo,
			carga: { periodo },
			clave: `${trabajo}:${periodo}`,
			intentos: 1,
			conservarHora: true,
		});
	});
}
