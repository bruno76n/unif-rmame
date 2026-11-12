/**
 * Las internas de los pedidos en línea: Inventario avisa que sus prendas van en camino o llegaron a aduana, el
 * trabajo «Vencer reservas» lo vence, y Catálogo pausa las publicaciones de un producto.
 * Fase 18 · docs/modulos/linea/pedidos-en-linea.md («Acciones internas»)
 *
 * Ninguna escribe bitácora: es el renglón de la acción o del trabajo que las llama.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { bloquearPedidoLinea, type EventoDePedidoLinea, eventoDePedido, type PedidoLinea } from "../dominio/pedidos.ts";
import { type EstadoDePedidoLinea, pedidosLinea } from "../tablas.ts";

/** Lo que reciben las internas de un W-. */
const deUnPedido = z.object({ pedido_linea_id: z.uuid() }).strict();

/** Pasa un W- de un estado a otro con su evento. */
async function pasarA(
	contexto: ContextoDeAccion,
	pedido: PedidoLinea,
	estado: EstadoDePedidoLinea,
	evento: EventoDePedidoLinea,
	cambios: Partial<typeof pedidosLinea.$inferInsert> = {},
): Promise<void> {
	await contexto.transaccion
		.update(pedidosLinea)
		.set({ estado, estadoEn: contexto.ahora.toString(), ...cambios })
		.where(eq(pedidosLinea.id, pedido.id));
	eventoDePedido(contexto, evento, pedido);
}

/**
 * `linea.prendas_en_camino`: Bodega surtió el W- a aduana; un W- por surtir queda esperando prendas.
 * @param contexto El contexto de `inventario.surtir_a_aduana`.
 * @param datos `pedido_linea_id`.
 * @returns Si cambió; en otro estado no hace nada.
 */
export async function prendasEnCamino(contexto: ContextoDeAccion, datos: unknown): Promise<{ cambio: boolean }> {
	const { pedido_linea_id } = deUnPedido.parse(datos);
	const pedido = await bloquearPedidoLinea(contexto.transaccion, pedido_linea_id);
	if (pedido.estado !== "por_surtir") return { cambio: false };
	await pasarA(contexto, pedido, "esperando_prendas", "pedido_linea.esperando_prendas");
	return { cambio: true };
}

/** Lo que recibe `linea.prendas_en_aduana`. */
const deLoQueLlego = z.object({ pedido_linea_id: z.uuid(), completo: z.boolean() }).strict();

/**
 * `linea.prendas_en_aduana`: Aduana recibió prendas de un W-. Con todas sus reservas ya en Aduana, queda listo para
 * empacar; si no, sigue esperando. Uno cancelado (o en otro estado) no cambia.
 * @param contexto El contexto de `inventario.recibir_en_aduana`.
 * @param datos `pedido_linea_id` y `completo`, que calcula Inventario.
 * @returns Si cambió.
 */
export async function prendasEnAduana(contexto: ContextoDeAccion, datos: unknown): Promise<{ cambio: boolean }> {
	const { pedido_linea_id, completo } = deLoQueLlego.parse(datos);
	const pedido = await bloquearPedidoLinea(contexto.transaccion, pedido_linea_id);
	if (!completo || !["por_surtir", "esperando_prendas"].includes(pedido.estado)) return { cambio: false };
	await pasarA(contexto, pedido, "listo_para_empacar", "pedido_linea.listo_para_empacar");
	return { cambio: true };
}

/**
 * `linea.vencer_pedido`: sus reservas vencieron sin pago; el W- y su pago quedan vencidos. Solo un W- esperando el
 * pago; en otro estado no hace nada.
 * @param contexto El contexto del trabajo «Vencer reservas», en la transacción que libera sus reservas.
 * @param datos `pedido_linea_id`.
 * @returns Si lo venció, con su folio para el renglón del trabajo.
 */
export async function vencerPedido(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<{ vencido: boolean; folio: string }> {
	const { pedido_linea_id } = deUnPedido.parse(datos);
	const pedido = await bloquearPedidoLinea(contexto.transaccion, pedido_linea_id);
	if (pedido.estado !== "esperando_pago") return { vencido: false, folio: pedido.folio };
	await pasarA(contexto, pedido, "vencido", "pedido_linea.vencido", { pagoEstado: "vencido" });
	return { vencido: true, folio: pedido.folio };
}

/** Lo que recibe `linea.pausar_publicaciones_producto`. */
const deUnProducto = z.object({ producto_id: z.uuid(), motivo: z.enum(["canal_apagado", "descontinuado"]) }).strict();

/**
 * `linea.pausar_publicaciones_producto`: Catálogo apagó «Tienda en línea» o descontinuó el producto. En la primera
 * versión no escribe nada: no hay publicaciones (llegan con uniformame.mx).
 * @param _contexto El contexto de la acción de Catálogo.
 * @param datos `producto_id` y `motivo`.
 * @returns Cuántas publicaciones pausó: ninguna.
 */
export async function pausarPublicacionesProducto(
	_contexto: ContextoDeAccion,
	datos: unknown,
): Promise<{ pausadas: number }> {
	deUnProducto.parse(datos);
	return { pausadas: 0 };
}
