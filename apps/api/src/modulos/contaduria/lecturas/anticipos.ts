/**
 * `contaduria.anticipo_del_pedido`: lo que Ventas lee del anticipo de su pedido, para «Crear nota» y el cajón del
 * pedido.
 * Fase 15 · docs/modulos/contaduria/anticipos.md («Lecturas»)
 */

import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { anticipoDelPedido } from "../dominio/anticipos.ts";

/** Lo que pide la lectura. */
const pedidoDeAnticipo = z.object({ pedido_id: z.uuid() }).strict();

/**
 * Lo recibido, lo aplicado (menos lo que regresó), lo que pasó a favor y el disponible del anticipo de un pedido.
 * @param contexto El contexto de quien lee.
 * @param datos El pedido.
 */
export async function anticipoDelPedidoLectura(contexto: ContextoDeAccion, datos: unknown) {
	const { pedido_id } = pedidoDeAnticipo.parse(datos);
	const anticipo = await anticipoDelPedido(contexto.transaccion, pedido_id);
	return {
		recibido_centavos: anticipo.recibido,
		aplicado_centavos: anticipo.aplicado - anticipo.regresado,
		a_favor_centavos: anticipo.aFavor,
		disponible_centavos: anticipo.disponible,
	};
}
