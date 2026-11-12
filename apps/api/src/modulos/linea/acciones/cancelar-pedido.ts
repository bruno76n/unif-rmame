/**
 * `linea.cancelar_pedido`: Tienda en línea cancela un W- que no se ha empacado. Sus reservas se liberan, lo que ya
 * estaba en aduana regresa a su origen y lo que viene en camino se reparte al llegar. El reembolso lo hace el sitio.
 * Fase 18 · docs/modulos/linea/pedidos-en-linea.md (regla 7, «`linea.cancelar_pedido`»)
 */

import { cancelarPedidoLinea } from "@uniformame/compartido/contratos/linea/pedidos";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { nombreDeCuenta, quienCambia, revisarMotivo } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { bloquearPedidoLinea, enPalabras, eventoDePedido } from "../dominio/pedidos.ts";
import { pedidosLinea } from "../tablas.ts";

/** Lo que regresa `inventario.liberar_reservas`: dónde estaba cada prenda liberada. */
const loLiberado = z.object({
	liberadas: z.array(
		z.object({ variante_id: z.uuid(), ubicacion_id: z.uuid(), piezas: z.number(), en_traspaso: z.boolean() }),
	),
});

/** Los estados desde los que se cancela: mientras no se empaque. */
const cancelables = new Set(["esperando_pago", "por_surtir", "esperando_prendas", "listo_para_empacar"]);

export const accionCancelarPedidoLinea = implementarAccion(cancelarPedidoLinea, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	await revisarMotivo(contexto, datos.motivo);
	const pedido = await bloquearPedidoLinea(transaccion, datos.pedido_linea_id);
	await tomarVersion(contexto, pedidosLinea, pedido.id, version, async () => ({
		pedido_linea_id: pedido.id,
		estado: pedido.estado,
	}));
	if (!cancelables.has(pedido.estado)) {
		throw errorDeRegla("no_cancelable", `${pedido.folio} está ${enPalabras(pedido.estado)}: ya no se puede cancelar.`);
	}
	const quien = quienCambia(contexto);
	await transaccion
		.update(pedidosLinea)
		.set({
			estado: "cancelado",
			estadoEn: contexto.ahora.toString(),
			canceladoEn: contexto.ahora.toString(),
			canceladoPor: quien,
			motivoCancelacion: datos.motivo,
			// Un pago pendiente ya no llega a nada.
			...(pedido.pagoEstado === "pendiente" ? { pagoEstado: "vencido" } : {}),
		})
		.where(eq(pedidosLinea.id, pedido.id));
	// Sus reservas se liberan: lo de aduana regresa a su origen, lo que viene en camino se reparte al llegar.
	const { liberadas } = loLiberado.parse(
		await contexto.interna("inventario.liberar_reservas", {
			motivo: "pedido_linea",
			documento_id: pedido.id,
			motivo_fin: "documento_cancelado",
			documento_cancelado: true,
		}),
	);
	eventoDePedido(contexto, "pedido_linea.cancelado", pedido);
	contexto.bitacora({
		descripcion: `${await nombreDeCuenta(contexto, quien)} canceló ${pedido.folio}: ${datos.motivo}`,
		entidad: "pedidos_linea",
		entidadId: pedido.id,
		entidadFolio: pedido.folio,
		antes: { estado: pedido.estado },
		despues: { estado: "cancelado", prendas: liberadas },
	});
	return {
		resultado: {
			mensaje: `${pedido.folio} cancelado. Lo que ya estaba en aduana regresa a su origen`,
			pedido_linea_id: pedido.id,
		},
		entidad: { nombre: "pedidos_linea", id: pedido.id },
	};
});
