/**
 * El proceso de la bandeja de eventos: la tarea `procesar_eventos` del worker.
 * Fase 4 · docs/cimientos/EVENTOS-Y-TRABAJOS.md («El proceso de la bandeja»)
 *
 * Toma los eventos sin procesar de 100 en 100 con `FOR UPDATE SKIP LOCKED` (dos workers nunca toman el
 * mismo), reparte cada uno en su propio `SAVEPOINT` y lo marca procesado. Si repartir uno falla, solo ese
 * se deshace: sube `intentos` y espera 1, 5, 30 y 120 minutos, y de ahí cada 120; al décimo intento avisa
 * a soporte.
 */

import { type AnyColumn, and, asc, eq, isNull, lte, or, type SQL, sql } from "drizzle-orm";
import type { Temporal } from "temporal-polyfill";
import { eventos } from "../../modulos/admin/tablas.ts";
import { crearContexto } from "../acciones/corredor.ts";
import type { Base } from "../base/conexion.ts";
import { enTransaccion, type Transaccion } from "../base/transacciones.ts";
import type { EventoGuardado, RegistroDeModulos } from "../modulos.ts";
import { encolar } from "./encolar.ts";

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
	/** Avisa a soporte que algo del worker no se pudo hacer: «{trabajo} falló: {error}». */
	avisarFalla: (trabajo: string, error: string) => Promise<void>;
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
 * La misma espera en SQL, para comparar en la base: la hora en que toca el siguiente intento.
 * @param desde Cuándo fue el último intento.
 * @param intentos Cuántas veces ha fallado.
 */
export function siguienteIntentoEnSql(desde: SQL | AnyColumn, intentos: SQL | AnyColumn): SQL {
	const casos = minutosDeEspera.map((minutos, i) => sql`WHEN ${i + 1} THEN ${minutos}::integer`);
	const masLarga = minutosDeEspera[minutosDeEspera.length - 1];
	return sql`${desde} + make_interval(mins => CASE ${intentos} ${sql.join(casos, sql` `)} ELSE ${masLarga}::integer END)`;
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
		.select({
			id: eventos.id,
			tipo: eventos.tipo,
			creadoEn: eventos.creadoEn,
			intentos: eventos.intentos,
			datos: eventos.datos,
			entidad: eventos.entidad,
			entidadId: eventos.entidadId,
		})
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
				await dependencias.avisarFalla(
					`El evento ${evento.tipo} (${evento.id})`,
					`${intentos} intentos; el último: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	}
	return listos.length;
}

/**
 * El reparto de cada evento con lo que registraron los módulos: el aviso en vivo (`NOTIFY ua_eventos`, que
 * llega a todas las instancias de la API al confirmar), lo que cada módulo hace al llegar ese tipo (crear
 * avisos a personas) y los trabajos que corren tras él.
 * @param registro Lo que registraron los módulos.
 * @param ahora La hora.
 */
export function repartirConLosModulos(
	registro: RegistroDeModulos,
	ahora: () => Temporal.Instant,
): DependenciasDelProceso["repartir"] {
	const trasEvento = new Map<string, string[]>();
	for (const trabajo of registro.trabajos.values()) {
		for (const tipo of trabajo.trasEventos ?? [])
			trasEvento.set(tipo, [...(trasEvento.get(tipo) ?? []), trabajo.nombre]);
	}
	return async (transaccion, evento) => {
		await transaccion.execute(sql`SELECT pg_notify('ua_eventos', ${evento.id})`);
		const atender = registro.alEvento.get(evento.tipo) ?? [];
		if (atender.length > 0) {
			const quien = { tipo: "sistema", trabajo: "procesar_eventos" } as const;
			const { contexto } = crearContexto(registro, transaccion, quien, "sistema.procesar_eventos", ahora(), undefined);
			for (const hacer of atender) await hacer(contexto, evento);
		}
		for (const tarea of trasEvento.get(evento.tipo) ?? []) {
			await encolar(transaccion, { tarea, cola: tarea, carga: { evento_id: evento.id } });
		}
	};
}
