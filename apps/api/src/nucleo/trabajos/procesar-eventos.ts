/**
 * El proceso de la bandeja de eventos: la tarea `procesar_eventos` del worker.
 * Fase 4 · docs/cimientos/EVENTOS-Y-TRABAJOS.md («El proceso de la bandeja»)
 *
 * Toma los eventos sin procesar de 100 en 100 con `FOR UPDATE SKIP LOCKED` (dos workers nunca toman el
 * mismo), reparte cada uno en su propio `SAVEPOINT` y lo marca procesado. Si repartir uno falla, solo ese
 * se deshace: sube `intentos` y espera 1, 5, 30 y 120 minutos, y de ahí cada 120; al décimo intento avisa
 * a soporte.
 */

import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import type { Temporal } from "temporal-polyfill";
import { eventos } from "../../modulos/admin/tablas.ts";
import type { Base } from "../base/conexion.ts";
import { enTransaccion, type Transaccion } from "../base/transacciones.ts";
import type { RegistroDeModulos } from "../modulos.ts";
import { encolar } from "./encolar.ts";

/** Un evento como lo lee el proceso. */
export interface EventoGuardado {
	id: string;
	tipo: string;
	creadoEn: string;
	intentos: number;
}

/** Cuántos eventos toma cada vuelta. */
const eventosPorVuelta = 100;

/** Cuántos minutos espera cada reintento: el primero 1, luego 5, 30 y 120; de ahí, cada 120. */
const minutosDeEspera = [1, 5, 30, 120] as const;

/** Al llegar a este intento, se avisa a soporte. */
const intentosParaAvisar = 10;

/** Lo que necesita el proceso. */
export interface DependenciasDelProceso {
	base: Base;
	/** Reparte un evento: lo avisa en vivo, crea sus avisos a personas y encola sus trabajos. */
	repartir: (transaccion: Transaccion, evento: EventoGuardado) => Promise<void>;
	/** Avisa a soporte que algo del worker no se pudo hacer. */
	avisarFalla: (texto: string) => Promise<void>;
	/** La hora. */
	ahora: () => Temporal.Instant;
}

/**
 * Los minutos que espera el siguiente intento después de fallar.
 * @param intentos Cuántas veces ha fallado ya, contando esta.
 */
export function esperaDelIntento(intentos: number): number {
	return minutosDeEspera[Math.min(intentos, minutosDeEspera.length) - 1] ?? minutosDeEspera[0];
}

/**
 * Los eventos listos para procesar: sin procesar y sin espera, o con su espera ya vencida.
 * @param ahora La hora, en texto ISO.
 */
export function listosParaProcesar(ahora: string) {
	return and(
		isNull(eventos.procesadoEn),
		or(isNull(eventos.siguienteIntentoEn), lte(eventos.siguienteIntentoEn, ahora)),
	);
}

/**
 * Procesa los eventos pendientes hasta que no quede ninguno listo.
 * @returns Cuántos eventos tomó (procesados o con su reintento anotado).
 */
export async function procesarEventos(dependencias: DependenciasDelProceso): Promise<number> {
	let total = 0;
	for (;;) {
		const tomados = await enTransaccion(dependencias.base, (transaccion) =>
			procesarUnaVuelta(dependencias, transaccion),
		);
		total += tomados;
		if (tomados < eventosPorVuelta) return total;
	}
}

/**
 * Toma hasta 100 eventos listos y los reparte, cada uno en su `SAVEPOINT`.
 * @returns Cuántos tomó.
 */
async function procesarUnaVuelta(dependencias: DependenciasDelProceso, transaccion: Transaccion): Promise<number> {
	const ahora = dependencias.ahora().toString();
	const listos = await transaccion
		.select({ id: eventos.id, tipo: eventos.tipo, creadoEn: eventos.creadoEn, intentos: eventos.intentos })
		.from(eventos)
		.where(listosParaProcesar(ahora))
		.orderBy(asc(eventos.creadoEn))
		.limit(eventosPorVuelta)
		.for("update", { skipLocked: true });
	for (const evento of listos) {
		const deEste = and(eq(eventos.id, evento.id), eq(eventos.creadoEn, evento.creadoEn));
		try {
			await transaccion.transaction((punto) => dependencias.repartir(punto, evento));
			await transaccion.update(eventos).set({ procesadoEn: ahora }).where(deEste);
		} catch (error) {
			const intentos = evento.intentos + 1;
			await transaccion
				.update(eventos)
				.set({
					intentos,
					siguienteIntentoEn: sql`${ahora}::timestamptz + make_interval(mins => ${esperaDelIntento(intentos)})`,
					ultimoError: error instanceof Error ? error.message : String(error),
				})
				.where(deEste);
			if (intentos === intentosParaAvisar) {
				await dependencias.avisarFalla(`El evento ${evento.tipo} (${evento.id}) falló ${intentos} veces`);
			}
		}
	}
	return listos.length;
}

/**
 * El reparto de cada evento con lo que registraron los módulos: el aviso en vivo (`NOTIFY ua_eventos`, que
 * llega a todas las instancias de la API al confirmar) y los trabajos que corren tras ese tipo de evento.
 * Los avisos a personas se suman en la parte 4 de la fase 4.
 * @param registro Lo que registraron los módulos.
 */
export function repartirConLosModulos(registro: RegistroDeModulos): DependenciasDelProceso["repartir"] {
	const trasEvento = new Map<string, string[]>();
	for (const trabajo of registro.trabajos.values()) {
		for (const tipo of trabajo.trasEventos ?? [])
			trasEvento.set(tipo, [...(trasEvento.get(tipo) ?? []), trabajo.nombre]);
	}
	return async (transaccion, evento) => {
		await transaccion.execute(sql`SELECT pg_notify('ua_eventos', ${evento.id})`);
		for (const tarea of trasEvento.get(evento.tipo) ?? []) {
			await encolar(transaccion, { tarea, cola: tarea, carga: { evento_id: evento.id } });
		}
	};
}
