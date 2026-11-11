/**
 * `inventario.recibido_de_ordenes`: lo recibido de cada línea de una orden de compra y las recepciones de cada
 * orden con su día. Con eso Compras calcula el estado de la orden, lo que falta en camino y el plazo real.
 * Fase 11 · docs/modulos/inventario/recepciones-en-aduana.md (regla 9, «Lecturas»)
 */

import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { recepcionesDeOrdenes, recibidoDeLineas } from "../dominio/recepciones.ts";

/** Lo que recibe: las líneas cuyo recibido se quiere, y las órdenes cuyas recepciones se quieren. */
const pedido = z
	.object({ orden_compra_linea_ids: z.array(z.uuid()).optional(), orden_compra_ids: z.array(z.uuid()).optional() })
	.strict();

/**
 * Lee lo recibido.
 * @param contexto El contexto de quien lee (Compras).
 * @param datos `orden_compra_linea_ids` y `orden_compra_ids`.
 * @returns `lineas`: por línea con recepciones, lo recibido menos lo rechazado que regresa, como texto decimal;
 * `recepciones`: por orden, cada recepción con su día.
 */
export async function recibidoDeOrdenes(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<{
	lineas: Record<string, string>;
	recepciones: Record<string, { recepcion_id: string; dia: string }[]>;
}> {
	const { orden_compra_linea_ids = [], orden_compra_ids = [] } = pedido.parse(datos);
	return {
		lineas: await recibidoDeLineas(contexto.transaccion, orden_compra_linea_ids),
		recepciones: await recepcionesDeOrdenes(contexto.transaccion, orden_compra_ids),
	};
}
