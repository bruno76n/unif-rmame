/**
 * El trabajo «Vencer reservas»: cada `inventario.minutos_vencer_reservas` busca las reservas activas con su
 * vencimiento ya pasado. Por W-, en una transacción: `linea.vencer_pedido` lo pasa a vencido y, si estaba esperando el
 * pago, sus reservas se liberan con `vencio_pago`.
 * Fase 18 · docs/modulos/inventario/reservas.md («Lo que llega después»: «Vencer reservas»)
 *
 * El W- se bloquea antes que sus reservas, como al confirmar su pago: si el pago llega a la vez, uno espera al otro
 * y el que va después ve lo que hizo el primero. Es repetible: lo ya vencido no se vuelve a vencer.
 */

import { and, eq, isNotNull, lt } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion, Trabajo } from "../../../nucleo/modulos.ts";
import { leerParametro } from "../../../nucleo/parametros.ts";
import { reservas } from "../tablas.ts";

/** Lo que regresa `linea.vencer_pedido`. */
const pedidoVencido = z.object({ vencido: z.boolean(), folio: z.string() });

/**
 * Vence un W- y libera sus reservas, en la transacción del trabajo.
 * @param contexto El contexto de la transacción.
 * @param pedidoLineaId El W-.
 */
async function vencerUnPedido(contexto: ContextoDeAccion, pedidoLineaId: string): Promise<void> {
	const { vencido, folio } = pedidoVencido.parse(
		await contexto.interna("linea.vencer_pedido", { pedido_linea_id: pedidoLineaId }),
	);
	// Pagado o cancelado mientras tanto: no se toca.
	if (!vencido) return;
	await contexto.interna("inventario.liberar_reservas", {
		motivo: "pedido_linea",
		documento_id: pedidoLineaId,
		motivo_fin: "vencio_pago",
		documento_cancelado: false,
	});
	contexto.guardarEvento({ tipo: "reserva.vencida", datos: { pedido_linea_id: pedidoLineaId }, tablas: ["reservas"] });
	contexto.bitacora({
		descripcion: `${folio} venció sin pago: sus prendas se liberaron`,
		entidad: "pedidos_linea",
		entidadId: pedidoLineaId,
		entidadFolio: folio,
		antes: { estado: "esperando_pago" },
		despues: { estado: "vencido" },
	});
}

export const vencerReservas: Trabajo = {
	nombre: "inventario.vencer_reservas",
	horario: async (contexto) => ({
		cada: "minutos",
		minutos: Number(await leerParametro(contexto.base, { clave: "inventario.minutos_vencer_reservas" })),
	}),
	correr: async (contexto) => {
		const vencidas = await contexto.base
			.selectDistinct({ pedidoLineaId: reservas.pedidoLineaId })
			.from(reservas)
			.where(
				and(
					eq(reservas.estado, "activa"),
					isNotNull(reservas.pedidoLineaId),
					lt(reservas.venceEn, contexto.ahora.toString()),
				),
			);
		for (const { pedidoLineaId } of vencidas) {
			if (pedidoLineaId === null) continue;
			await contexto.enTransaccion((enEsta) => vencerUnPedido(enEsta, pedidoLineaId));
		}
	},
};
