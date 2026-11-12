/**
 * Lo que otros módulos leen de los pedidos: `ventas.avance_pedido`, `ventas.pedido_para_cobro` y
 * `ventas.pedidos_abiertos_de_variante`.
 * Fase 16 · docs/modulos/ventas/pedidos.md («Lecturas»)
 */

import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { avanceDelPedido } from "../dominio/avance-de-pedido.ts";
import { notasDelPedido } from "../dominio/notas.ts";
import { leerPedido, renglonesVigentes, totalDe } from "../dominio/pedidos.ts";
import { pedidoRenglones, pedidos } from "../tablas.ts";

/** Lo que piden las lecturas de un pedido. */
const pedidoDeLectura = z.object({ pedido_id: z.uuid() }).strict();

/**
 * Por prenda y talla, las cuentas del avance de un pedido, y su folio, su estado, su etapa y su alerta.
 * @param contexto El contexto de quien lee (Inventario, Producción o Ventas).
 * @param datos El pedido.
 */
export async function avancePedido(contexto: ContextoDeAccion, datos: unknown) {
	const { pedido_id } = pedidoDeLectura.parse(datos);
	const pedido = await leerPedido(contexto.transaccion, pedido_id);
	const avance = await avanceDelPedido(contexto, pedido, await renglonesVigentes(contexto.transaccion, pedido_id));
	return {
		folio: pedido.folio,
		estado: pedido.estado,
		etapa: avance.etapa,
		alerta: avance.alerta,
		tallas: avance.tallas.map((talla) => ({
			variante_id: talla.varianteId,
			pedido: talla.pedido,
			entregado: talla.entregado,
			en_nota: talla.enNota,
			listo: talla.listo,
			de_bodega: talla.deBodega,
			en_produccion: talla.enProduccion,
			falta: talla.falta,
			por_mandar: talla.porMandar,
			de_mas: talla.deMas,
		})),
	};
}

/**
 * Lo que Contaduría necesita de un pedido para cobrarle: su cliente, si está confirmado y abierto, su total y lo de
 * sus notas no canceladas.
 * @param contexto El contexto de Contaduría.
 * @param datos El pedido.
 */
export async function pedidoParaCobro(contexto: ContextoDeAccion, datos: unknown) {
	const { pedido_id } = pedidoDeLectura.parse(datos);
	const pedido = await leerPedido(contexto.transaccion, pedido_id);
	return {
		cliente_id: pedido.clienteId,
		folio: pedido.folio,
		abierto: pedido.estado === "confirmado",
		total_centavos: totalDe(await renglonesVigentes(contexto.transaccion, pedido_id)),
		notas_centavos: (await notasDelPedido(contexto.transaccion, pedido_id)).subtotalCentavos,
	};
}

/** Lo que pide `pedidos_abiertos_de_variante`. */
const pedidoDeVariante = z.object({ variante_id: z.uuid() }).strict();

/**
 * Los folios de los pedidos en borrador o confirmados con piezas de una talla.
 * @param contexto El contexto de Catálogo.
 * @param datos La variante.
 */
export async function pedidosAbiertosDeVariante(contexto: ContextoDeAccion, datos: unknown) {
	const { variante_id } = pedidoDeVariante.parse(datos);
	const filas = await contexto.transaccion
		.selectDistinct({ folio: pedidos.folio })
		.from(pedidoRenglones)
		.innerJoin(pedidos, eq(pedidos.id, pedidoRenglones.pedidoId))
		.where(
			and(
				eq(pedidoRenglones.varianteId, variante_id),
				isNull(pedidoRenglones.hastaVersion),
				gt(pedidoRenglones.cantidad, 0),
				inArray(pedidos.estado, ["borrador", "confirmado"]),
			),
		)
		.orderBy(pedidos.folio);
	return { folios: filas.map((fila) => fila.folio) };
}
