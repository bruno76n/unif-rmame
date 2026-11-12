/**
 * Lo que comparten los gastos: un valor de sus listas y su folio G-.
 * Fase 17 · docs/modulos/contaduria/gastos.md («Las listas», «Acciones»)
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { listas, listaValores } from "../../admin/tablas.ts";

/** Un valor de una lista, como lo usa un gasto. */
export type ValorDeLista = Pick<typeof listaValores.$inferSelect, "id" | "nombre" | "seleccionable" | "bajaEn">;

/**
 * Un valor de una lista de los gastos, por su id o por su clave.
 * @param transaccion La transacción.
 * @param lista La clave de la lista.
 * @param valor El id del valor, o su clave.
 * @returns El valor, o nada si no es de esa lista.
 */
export async function valorDeLista(
	transaccion: Transaccion,
	lista: string,
	valor: string | { clave: string },
): Promise<ValorDeLista | undefined> {
	const [encontrado] = await transaccion
		.select({
			id: listaValores.id,
			nombre: listaValores.nombre,
			seleccionable: listaValores.seleccionable,
			bajaEn: listaValores.bajaEn,
		})
		.from(listaValores)
		.innerJoin(listas, eq(listas.id, listaValores.listaId))
		.where(
			and(
				eq(listas.clave, lista),
				typeof valor === "string" ? eq(listaValores.id, valor) : eq(listaValores.clave, valor.clave),
			),
		);
	return encontrado;
}

/**
 * Toma el folio G- de un gasto: al final, después de los candados de la acción.
 * @param contexto El contexto de la acción.
 */
export async function folioDeGasto(contexto: ContextoDeAccion): Promise<string> {
	return z.object({ folio: z.string() }).parse(await contexto.interna("admin.tomar_folio", { tipo: "gasto" })).folio;
}
