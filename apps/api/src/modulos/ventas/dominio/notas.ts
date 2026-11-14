/**
 * Lo común de las notas de entrega: leer una bloqueada y lo que tiene un pedido en sus notas.
 * Fase 16 · docs/modulos/ventas/notas-de-entrega.md (reglas 1 a 6) y docs/modulos/ventas/pedidos.md («El avance»)
 */

import { and, eq, ne, sql } from "drizzle-orm";
import { type QuienLlama, tieneDepartamento } from "../../../nucleo/acceso/quien.ts";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { notaEntregaLineas, notasEntrega } from "../tablas.ts";

/** Una nota de entrega como está guardada. */
export type NotaEntrega = typeof notasEntrega.$inferSelect;

/**
 * Lee una nota de entrega y la bloquea hasta que termine la transacción.
 * @param transaccion La transacción.
 * @param notaId La nota.
 * @throws `404` si no existe.
 */
export async function leerNota(transaccion: Transaccion, notaId: string): Promise<NotaEntrega> {
	const [nota] = await transaccion.select().from(notasEntrega).where(eq(notasEntrega.id, notaId)).for("update");
	if (nota === undefined) throw noExiste();
	return nota;
}

/** Lo de una talla en las notas de un pedido: lo entregado y lo que va en nota (por despachar o en camino). */
export interface PiezasEnNotas {
	entregado: number;
	enNota: number;
}

/**
 * Por variante, lo que un pedido tiene en sus notas que no se cancelaron.
 * @param transaccion La transacción.
 * @param pedidoId El pedido.
 */
export async function piezasEnNotas(transaccion: Transaccion, pedidoId: string): Promise<Map<string, PiezasEnNotas>> {
	const filas = await transaccion
		.select({
			varianteId: notaEntregaLineas.varianteId,
			entregado:
				sql<number>`coalesce(sum(${notaEntregaLineas.cantidad}) FILTER (WHERE ${notasEntrega.estado} = 'entregada'), 0)`.mapWith(
					Number,
				),
			enNota:
				sql<number>`coalesce(sum(${notaEntregaLineas.cantidad}) FILTER (WHERE ${notasEntrega.estado} in ('por_despachar', 'en_camino')), 0)`.mapWith(
					Number,
				),
		})
		.from(notaEntregaLineas)
		.innerJoin(notasEntrega, eq(notasEntrega.id, notaEntregaLineas.notaEntregaId))
		.where(and(eq(notasEntrega.pedidoId, pedidoId), ne(notasEntrega.estado, "cancelada")))
		.groupBy(notaEntregaLineas.varianteId);
	return new Map(filas.map((fila) => [fila.varianteId, { entregado: fila.entregado, enNota: fila.enNota }]));
}

/**
 * Lo de las notas de un pedido que no se cancelaron: cuántas son y la suma de sus subtotales.
 * @param transaccion La transacción.
 * @param pedidoId El pedido.
 */
export async function notasDelPedido(transaccion: Transaccion, pedidoId: string) {
	const [suma] = await transaccion
		.select({
			cuantas: sql<number>`count(*)`.mapWith(Number),
			subtotalCentavos: sql<number>`coalesce(sum(${notasEntrega.subtotalCentavos}), 0)`.mapWith(Number),
		})
		.from(notasEntrega)
		.where(and(eq(notasEntrega.pedidoId, pedidoId), ne(notasEntrega.estado, "cancelada")));
	return { cuantas: suma?.cuantas ?? 0, subtotalCentavos: suma?.subtotalCentavos ?? 0 };
}

/**
 * Si quien llama ve los precios de las notas de entrega: Ventas, Contaduría y Dirección (y la dueña); a Aduana nunca le
 * viajan importes, y a la cuenta de soporte nunca un monto. Es la regla de su cajón, de su hoja en PDF y de lo que
 * regresan sus acciones.
 * @param quien Quién llama.
 */
export function vePreciosDeNotas(quien: QuienLlama | { readonly tipo: "sistema" }): boolean {
	return tieneDepartamento(quien, "ventas", "contaduria", "direccion") && !(quien.tipo === "cuenta" && quien.esSoporte);
}
