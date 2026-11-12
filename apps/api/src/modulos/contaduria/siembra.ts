/**
 * Lo que siembra `contaduria`: la lista «Cuentas de la fábrica», con un valor, y las de los gastos: «Categorías de
 * gasto» y «Tipos de comprobante de gasto». La dueña agrega las demás.
 * Fase 15 · docs/modulos/contaduria/pagos-y-saldo-a-favor.md («La lista «Cuentas de la fábrica»») y
 * docs/modulos/admin/configuracion.md («Las listas que hay»)
 * Fase 17 · docs/modulos/contaduria/gastos.md («Las listas»)
 *
 * Agrega lo que falta y nunca cambia lo que ya está, para no pisar lo que cambió la dueña.
 */

import { eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { Base } from "../../nucleo/base/conexion.ts";
import type { Semilla } from "../../nucleo/base/siembra.ts";
import { listas, listaValores } from "../admin/tablas.ts";

/** La clave de la lista de las cuentas de la fábrica. */
export const listaDeCuentasFabrica = "cuentas_fabrica";

/**
 * Siembra la lista «Cuentas de la fábrica» con su primer valor, si falta.
 * @returns Cuántos renglones nuevos agregó.
 */
async function sembrarCuentasFabrica(base: Base): Promise<number> {
	const nueva = await base
		.insert(listas)
		.values({ id: uuidv7(), clave: listaDeCuentasFabrica, nombre: "Cuentas de la fábrica", modulo: "contaduria" })
		.onConflictDoNothing();
	const [lista] = await base.select({ id: listas.id }).from(listas).where(eq(listas.clave, listaDeCuentasFabrica));
	if (lista === undefined) throw new Error("no se sembró la lista de cuentas de la fábrica");
	// El primer valor solo nace con la lista: si la dueña lo da de baja, no regresa.
	if ((nueva.rowCount ?? 0) === 0) return 0;
	const nombre = "Cuenta de la fábrica";
	const valor = await base
		.insert(listaValores)
		.values({ id: uuidv7(), listaId: lista.id, nombre, nombreNormalizado: sql`sin_acentos(${nombre})`, orden: 1 })
		.onConflictDoNothing();
	return (nueva.rowCount ?? 0) + (valor.rowCount ?? 0);
}

export const semillaDeCuentasFabrica: Semilla = { sembrar: sembrarCuentasFabrica };

/** La clave de la lista de las categorías de gasto. */
export const listaDeCategoriasGasto = "categorias_gasto";

/** La clave de la lista de los tipos de comprobante de gasto. */
export const listaDeTiposComprobante = "tipos_comprobante_gasto";

/** Un valor que se siembra en una lista. */
interface ValorSembrado {
	nombre: string;
	clave?: string;
	/** Falso: lo pone el sistema, nadie lo escoge. */
	seleccionable?: boolean;
}

/** Las categorías de gasto: «Reparación de máquinas» solo la pone un servicio de Mantenimiento. */
const categoriasGasto: readonly ValorSembrado[] = [
	{ nombre: "Luz" },
	{ nombre: "Agua" },
	{ nombre: "Teléfono e internet" },
	{ nombre: "Gasolina y fletes" },
	{ nombre: "Papelería y oficina" },
	{ nombre: "Limpieza" },
	{ nombre: "Paquetería" },
	{ nombre: "Reparación de máquinas", clave: "reparacion_maquinas", seleccionable: false },
];

/** Los tipos de comprobante de un gasto. */
const tiposComprobante: readonly ValorSembrado[] = [
	{ nombre: "Factura", clave: "factura" },
	{ nombre: "Nota o ticket", clave: "nota_ticket" },
	{ nombre: "Sin comprobante", clave: "sin_comprobante" },
];

/**
 * Siembra una lista y los valores que le falten, al final y en su orden.
 * @param base La base.
 * @param lista Su clave y su nombre.
 * @param valores Sus valores.
 * @returns Cuántos renglones nuevos agregó.
 */
async function sembrarLista(
	base: Base,
	lista: { clave: string; nombre: string },
	valores: readonly ValorSembrado[],
): Promise<number> {
	const nueva = await base
		.insert(listas)
		.values({ id: uuidv7(), clave: lista.clave, nombre: lista.nombre, modulo: "contaduria" })
		.onConflictDoNothing();
	const [sembrada] = await base.select({ id: listas.id }).from(listas).where(eq(listas.clave, lista.clave));
	if (sembrada === undefined) throw new Error(`no se sembró la lista ${lista.clave}`);
	let nuevos = nueva.rowCount ?? 0;
	for (const [i, valor] of valores.entries()) {
		const hecho = await base
			.insert(listaValores)
			.values({
				id: uuidv7(),
				listaId: sembrada.id,
				nombre: valor.nombre,
				nombreNormalizado: sql`sin_acentos(${valor.nombre})`,
				clave: valor.clave ?? null,
				seleccionable: valor.seleccionable ?? true,
				orden: i + 1,
			})
			.onConflictDoNothing();
		nuevos += hecho.rowCount ?? 0;
	}
	return nuevos;
}

export const semillaDeListasDeGastos: Semilla = {
	sembrar: async (base) =>
		(await sembrarLista(base, { clave: listaDeCategoriasGasto, nombre: "Categorías de gasto" }, categoriasGasto)) +
		(await sembrarLista(
			base,
			{ clave: listaDeTiposComprobante, nombre: "Tipos de comprobante de gasto" },
			tiposComprobante,
		)),
};
