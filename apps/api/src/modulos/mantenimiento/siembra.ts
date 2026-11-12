/**
 * Lo que siembra `mantenimiento`: los motivos de falla y la lista «Áreas del taller».
 * Fase 13 · docs/modulos/mantenimiento/maquinas-fallas-y-servicios.md («La tabla `motivos_falla`», «La lista
 * «Áreas del taller»») y docs/modulos/admin/configuracion.md («Las listas que hay»)
 *
 * Agrega lo que falta y nunca cambia lo que ya está, para no pisar lo que cambió la dueña.
 */

import { eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { Base } from "../../nucleo/base/conexion.ts";
import type { Semilla } from "../../nucleo/base/siembra.ts";
import { listas, listaValores } from "../admin/tablas.ts";
import { motivosFalla } from "./tablas.ts";

/** La clave de la lista de las áreas del taller. */
export const listaDeAreas = "areas_taller";

/** Los motivos de falla: nombre y si detiene la máquina, en el orden de sus botones. */
const motivos: readonly [string, boolean][] = [
	["No prende", true],
	["Rompe el hilo", false],
	["Salta puntada", false],
	["Hace ruido", false],
	["Tira aceite", false],
	["Otra cosa", false],
];

/** Las áreas del taller. */
const areas = ["Costura", "Ojal y botón", "Planchado", "Corte"];

/**
 * Siembra los motivos de falla que falten.
 * @returns Cuántos agregó.
 */
async function sembrarMotivos(base: Base): Promise<number> {
	let nuevos = 0;
	for (const [i, [nombre, detiene]] of motivos.entries()) {
		const hecho = await base
			.insert(motivosFalla)
			.values({ id: uuidv7(), nombre, detieneMaquina: detiene, orden: i + 1 })
			.onConflictDoNothing();
		nuevos += hecho.rowCount ?? 0;
	}
	return nuevos;
}

/**
 * Siembra la lista «Áreas del taller» y las áreas que falten.
 * @returns Cuántos renglones nuevos agregó.
 */
async function sembrarAreas(base: Base): Promise<number> {
	const nueva = await base
		.insert(listas)
		.values({ id: uuidv7(), clave: listaDeAreas, nombre: "Áreas del taller", modulo: "mantenimiento" })
		.onConflictDoNothing();
	const [lista] = await base.select({ id: listas.id }).from(listas).where(eq(listas.clave, listaDeAreas));
	if (lista === undefined) throw new Error("no se sembró la lista de áreas del taller");
	let nuevos = nueva.rowCount ?? 0;
	for (const [i, nombre] of areas.entries()) {
		const hecho = await base
			.insert(listaValores)
			.values({ id: uuidv7(), listaId: lista.id, nombre, nombreNormalizado: sql`sin_acentos(${nombre})`, orden: i + 1 })
			.onConflictDoNothing();
		nuevos += hecho.rowCount ?? 0;
	}
	return nuevos;
}

export const semillaDeMotivosFalla: Semilla = { sembrar: sembrarMotivos };
export const semillaDeAreasTaller: Semilla = { sembrar: sembrarAreas };
