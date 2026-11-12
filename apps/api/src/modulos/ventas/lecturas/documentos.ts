/**
 * Lo que otros módulos preguntan de los documentos de Ventas: cuáles siguen abiertos (el cuadre de Inventario) y sus
 * folios (los mensajes de Contaduría).
 * Fase 16 · docs/modulos/ventas/pedidos.md («`ventas.documentos_abiertos`», «`ventas.folios_de_documentos`»)
 */

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { notasCredito, notasEntrega, pedidos } from "../tablas.ts";

/** Los documentos que se preguntan, por tipo. */
const pedidoDeDocumentos = z
	.object({
		pedido_ids: z.array(z.uuid()).optional(),
		nota_entrega_ids: z.array(z.uuid()).optional(),
		nota_credito_ids: z.array(z.uuid()).optional(),
	})
	.strict();

/**
 * `ventas.documentos_abiertos`: de los pedidos y las notas que recibe, los que siguen abiertos: un pedido confirmado
 * y una nota por despachar o en camino.
 * @param contexto El contexto de quien pregunta.
 * @param datos `pedido_ids` y `nota_entrega_ids`.
 */
export async function documentosAbiertos(contexto: ContextoDeAccion, datos: unknown) {
	const { pedido_ids = [], nota_entrega_ids = [] } = pedidoDeDocumentos.parse(datos);
	const { transaccion } = contexto;
	const pedidosAbiertos =
		pedido_ids.length === 0
			? []
			: await transaccion
					.select({ id: pedidos.id })
					.from(pedidos)
					.where(and(inArray(pedidos.id, pedido_ids), eq(pedidos.estado, "confirmado")));
	const notasAbiertas =
		nota_entrega_ids.length === 0
			? []
			: await transaccion
					.select({ id: notasEntrega.id })
					.from(notasEntrega)
					.where(
						and(
							inArray(notasEntrega.id, nota_entrega_ids),
							inArray(notasEntrega.estado, ["por_despachar", "en_camino"]),
						),
					);
	return {
		pedido_ids: pedidosAbiertos.map((pedido) => pedido.id),
		nota_entrega_ids: notasAbiertas.map((nota) => nota.id),
	};
}

/**
 * `ventas.folios_de_documentos`: por id, el folio de cada pedido, nota de entrega y nota de crédito que recibe. Un
 * documento que no existe, o una nota de crédito sin folio, sale con su id.
 * @param contexto El contexto de quien pregunta.
 * @param datos `pedido_ids`, `nota_entrega_ids` y `nota_credito_ids`.
 */
export async function foliosDeDocumentos(contexto: ContextoDeAccion, datos: unknown) {
	const { pedido_ids = [], nota_entrega_ids = [], nota_credito_ids = [] } = pedidoDeDocumentos.parse(datos);
	const { transaccion } = contexto;
	const leidos = [
		...(pedido_ids.length === 0
			? []
			: await transaccion
					.select({ id: pedidos.id, folio: pedidos.folio })
					.from(pedidos)
					.where(inArray(pedidos.id, pedido_ids))),
		...(nota_entrega_ids.length === 0
			? []
			: await transaccion
					.select({ id: notasEntrega.id, folio: notasEntrega.folio })
					.from(notasEntrega)
					.where(inArray(notasEntrega.id, nota_entrega_ids))),
		...(nota_credito_ids.length === 0
			? []
			: await transaccion
					.select({ id: notasCredito.id, folio: notasCredito.folio })
					.from(notasCredito)
					.where(inArray(notasCredito.id, nota_credito_ids))),
	];
	// Una nota de crédito sin autorizar todavía no tiene folio: sale con su id, como lo que no existe.
	const folios = new Map(leidos.flatMap((leido) => (leido.folio === null ? [] : [[leido.id, leido.folio]])));
	const ids = [...pedido_ids, ...nota_entrega_ids, ...nota_credito_ids];
	return { folios: Object.fromEntries(ids.map((id) => [id, folios.get(id) ?? id])) };
}
