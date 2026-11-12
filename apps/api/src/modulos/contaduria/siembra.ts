/**
 * Lo que siembra `contaduria`: la lista «Cuentas de la fábrica», con un valor. La dueña agrega las demás.
 * Fase 15 · docs/modulos/contaduria/pagos-y-saldo-a-favor.md («La lista «Cuentas de la fábrica»») y
 * docs/modulos/admin/configuracion.md («Las listas que hay»)
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
