/**
 * Lo que comparten `admin.tomar_folio` y `admin.siguiente_folio`: el formato del folio y el contador de
 * cada alcance.
 * Fase 4 · docs/modulos/admin/folios.md («Reglas»)
 */

import { and, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { contadoresFolio } from "../tablas.ts";

/** Lo que va en el prefijo de la plantilla en lugar del alcance. */
const marcaDeAlcance = /\{(año|T|tipo)\}/;

/**
 * Arma un folio: el prefijo y el número rellenado con ceros hasta sus dígitos (puede crecer más).
 * @param prefijo El prefijo ya armado: `PE-`, `OP-2026-`.
 * @param numero El número.
 * @param digitos Los dígitos mínimos.
 */
export function armarFolio(prefijo: string, numero: number, digitos: number): string {
	return `${prefijo}${String(numero).padStart(digitos, "0")}`;
}

/**
 * El prefijo de un alcance: el de la plantilla con el alcance en su marca (`OP-{año}-` → `OP-2026-`).
 * @param prefijo El prefijo de la plantilla.
 * @param alcance El alcance.
 */
export function prefijoDelAlcance(prefijo: string, alcance: string): string {
	return prefijo.replace(marcaDeAlcance, alcance);
}

/**
 * El alcance que toca cuando no se dio: el año del día de negocio en los folios con `{año}`.
 * @param contexto El contexto de la acción.
 * @param prefijo El prefijo de la plantilla.
 * @param alcance El alcance que se pidió.
 */
export function alcanceDe(contexto: ContextoDeAccion, prefijo: string, alcance: string | undefined): string {
	if (alcance !== undefined && alcance !== "") return alcance;
	return prefijo.includes("{año}") ? String(contexto.diaDeNegocio.year) : "";
}

/**
 * La plantilla de un tipo de folio (su renglón de la siembra, con alcance vacío).
 * @throws Error si el tipo no existe: lo siembra `admin`, así que es un error del programa.
 */
export async function plantillaDe(transaccion: Transaccion, tipo: string) {
	const [plantilla] = await transaccion
		.select()
		.from(contadoresFolio)
		.where(and(eq(contadoresFolio.tipo, tipo), eq(contadoresFolio.alcance, "")));
	if (plantilla === undefined) throw new Error(`no existe el tipo de folio ${tipo}`);
	return plantilla;
}

/**
 * Crea el contador de un alcance nuevo con el formato de su plantilla, si todavía no existe.
 * @param transaccion La transacción de la acción.
 * @param plantilla La plantilla del tipo.
 * @param alcance El alcance nuevo.
 */
export async function crearContadorDelAlcance(
	transaccion: Transaccion,
	plantilla: typeof contadoresFolio.$inferSelect,
	alcance: string,
): Promise<void> {
	if (alcance === "" || !marcaDeAlcance.test(plantilla.prefijo)) {
		throw new Error(`el folio ${plantilla.tipo} no lleva alcance`);
	}
	await transaccion
		.insert(contadoresFolio)
		.values({
			id: uuidv7(),
			tipo: plantilla.tipo,
			alcance,
			prefijo: prefijoDelAlcance(plantilla.prefijo, alcance),
			siguiente: plantilla.minimo,
			digitos: plantilla.digitos,
			minimo: plantilla.minimo,
			maximo: plantilla.maximo,
			asigna: plantilla.asigna,
			modulo: plantilla.modulo,
		})
		.onConflictDoNothing();
}

/** El contador de un tipo y alcance, si existe. */
export async function contadorDe(transaccion: Transaccion, tipo: string, alcance: string) {
	const [contador] = await transaccion
		.select()
		.from(contadoresFolio)
		.where(and(eq(contadoresFolio.tipo, tipo), eq(contadoresFolio.alcance, alcance)));
	return contador;
}
