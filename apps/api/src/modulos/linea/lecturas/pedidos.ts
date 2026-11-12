/**
 * Las lecturas de los pedidos en línea para otros módulos: los W- abiertos con una variante (Catálogo, al dar de baja
 * una talla), cuáles de unos W- siguen abiertos (Inventario, en el cuadre y al recibir en aduana) y sus folios
 * (Inventario, en «No la encuentro»).
 * Fase 18 · docs/modulos/linea/pedidos-en-linea.md («Lecturas»)
 */

import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { pedidoLineaRenglones, pedidosLinea } from "../tablas.ts";

/** Abierto es no cancelado ni vencido. */
const cerrados = ["cancelado", "vencido"];

/**
 * `linea.pedidos_abiertos_de_variante`: los folios de los W- abiertos con esa variante.
 * @param datos `variante_id`.
 */
export async function pedidosAbiertosDeVariante(contexto: ContextoDeAccion, datos: unknown) {
	const { variante_id } = z.object({ variante_id: z.uuid() }).strict().parse(datos);
	const filas = await contexto.transaccion
		.selectDistinct({ folio: pedidosLinea.folio })
		.from(pedidosLinea)
		.innerJoin(pedidoLineaRenglones, eq(pedidoLineaRenglones.pedidoLineaId, pedidosLinea.id))
		.where(and(eq(pedidoLineaRenglones.varianteId, variante_id), notInArray(pedidosLinea.estado, cerrados)))
		.orderBy(asc(pedidosLinea.folio));
	return { folios: filas.map((fila) => fila.folio) };
}

/**
 * `linea.pedidos_abiertos`: cuáles de esos W- siguen abiertos.
 * @param datos `pedido_linea_ids`.
 */
export async function pedidosAbiertos(contexto: ContextoDeAccion, datos: unknown) {
	const { pedido_linea_ids } = z
		.object({ pedido_linea_ids: z.array(z.uuid()) })
		.strict()
		.parse(datos);
	if (pedido_linea_ids.length === 0) return { pedido_linea_ids: [] };
	const filas = await contexto.transaccion
		.select({ id: pedidosLinea.id })
		.from(pedidosLinea)
		.where(and(inArray(pedidosLinea.id, pedido_linea_ids), notInArray(pedidosLinea.estado, cerrados)));
	return { pedido_linea_ids: filas.map((fila) => fila.id) };
}

/**
 * `linea.folios_de_pedidos`: el folio de cada W-, para los mensajes y la bitácora de Inventario («No la encuentro»).
 * @param datos `pedido_linea_ids`.
 * @returns Por id, su folio; el que no existe no viene.
 */
export async function foliosDePedidos(contexto: ContextoDeAccion, datos: unknown) {
	const { pedido_linea_ids } = z
		.object({ pedido_linea_ids: z.array(z.uuid()) })
		.strict()
		.parse(datos);
	if (pedido_linea_ids.length === 0) return { folios: {} };
	const filas = await contexto.transaccion
		.select({ id: pedidosLinea.id, folio: pedidosLinea.folio })
		.from(pedidosLinea)
		.where(inArray(pedidosLinea.id, pedido_linea_ids));
	return { folios: Object.fromEntries(filas.map((fila) => [fila.id, fila.folio])) };
}
