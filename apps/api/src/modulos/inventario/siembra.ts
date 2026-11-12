/**
 * Lo que siembra `inventario` de la fase 14: la lista «Motivos de ajuste» y los mínimos de existencia.
 * Fase 14 · docs/modulos/inventario/diferencias-ajustes-y-mermas.md («La lista «Motivos de ajuste»»),
 * docs/modulos/admin/configuracion.md («Las listas que hay») y minimos-y-reabasto.md (regla 1, «La tabla `minimos`»)
 *
 * Agrega lo que falta y nunca cambia lo que ya está, para no pisar lo que agregó la dueña.
 */

import { eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { Base } from "../../nucleo/base/conexion.ts";
import type { Semilla } from "../../nucleo/base/siembra.ts";
import { listas, listaValores } from "../admin/tablas.ts";
import { minimos, ubicaciones } from "./tablas.ts";

/** La clave de la lista de los motivos de ajuste. */
export const listaDeMotivosAjuste = "motivos_ajuste";

/** Los motivos de ajuste, en su orden. */
const motivos = [
	"Venta que no tenía existencia en el sistema",
	"Pieza dañada o manchada",
	"Error al capturar una entrada o salida",
	"No se encontró: posible extravío",
	"Apareció mercancía sin registrar",
];

/**
 * Siembra la lista «Motivos de ajuste» y los motivos que falten.
 * @returns Cuántos renglones nuevos agregó.
 */
async function sembrarMotivosAjuste(base: Base): Promise<number> {
	const nueva = await base
		.insert(listas)
		.values({ id: uuidv7(), clave: listaDeMotivosAjuste, nombre: "Motivos de ajuste", modulo: "inventario" })
		.onConflictDoNothing();
	const [lista] = await base.select({ id: listas.id }).from(listas).where(eq(listas.clave, listaDeMotivosAjuste));
	if (lista === undefined) throw new Error("no se sembró la lista de motivos de ajuste");
	let nuevos = nueva.rowCount ?? 0;
	for (const [i, nombre] of motivos.entries()) {
		const hecho = await base
			.insert(listaValores)
			.values({ id: uuidv7(), listaId: lista.id, nombre, nombreNormalizado: sql`sin_acentos(${nombre})`, orden: i + 1 })
			.onConflictDoNothing();
		nuevos += hecho.rowCount ?? 0;
	}
	return nuevos;
}

export const semillaDeMotivosAjuste: Semilla = { sembrar: sembrarMotivosAjuste };

/** Los mínimos iniciales (regla 1): por código de ubicación, el de las tallas de mayor venta y el de las demás. */
const minimosIniciales: readonly [string, number, number][] = [
	["BOD", 30, 12],
	["T1", 8, 4],
	["T2", 8, 4],
];

/**
 * Siembra los mínimos que falten: uno vigente por ubicación y nivel.
 * @returns Cuántos agregó.
 */
async function sembrarMinimos(base: Base): Promise<number> {
	let nuevos = 0;
	for (const [codigo, mayorVenta, demas] of minimosIniciales) {
		const [ubicacion] = await base
			.select({ id: ubicaciones.id })
			.from(ubicaciones)
			.where(eq(ubicaciones.codigo, codigo));
		if (ubicacion === undefined) throw new Error(`no hay ubicación ${codigo} para sus mínimos`);
		for (const [nivel, piezas] of [
			["mayor_venta", mayorVenta],
			["demas", demas],
		] as const) {
			const hecho = await base
				.insert(minimos)
				.values({ id: uuidv7(), ubicacionId: ubicacion.id, nivel, piezas })
				.onConflictDoNothing();
			nuevos += hecho.rowCount ?? 0;
		}
	}
	return nuevos;
}

export const semillaDeMinimos: Semilla = { sembrar: sembrarMinimos };
