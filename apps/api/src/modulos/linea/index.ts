/**
 * El módulo `linea`: los pedidos W- de la tienda en línea, desde que llegan del sitio hasta que quedan listos para
 * empacar.
 * Fase 18 · docs/modulos/linea/pedidos-en-linea.md
 *
 * Empacar, la guía, la entrega, las devoluciones y el panel llegan con uniformame.mx.
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import { accionCancelarPedidoLinea } from "./acciones/cancelar-pedido.ts";
import { accionConfirmarPago } from "./acciones/confirmar-pago.ts";
import { accionRecibirPedido } from "./acciones/recibir-pedido.ts";
import { pausarPublicacionesProducto, prendasEnAduana, prendasEnCamino, vencerPedido } from "./internas/pedidos.ts";
import { foliosDePedidos, pedidosAbiertos, pedidosAbiertosDeVariante } from "./lecturas/pedidos.ts";
import { semillaDeParametrosDeLinea } from "./parametros.ts";

export default definirModulo({
	nombre: "linea",
	acciones: [accionRecibirPedido, accionConfirmarPago, accionCancelarPedidoLinea],
	internas: {
		prendas_en_camino: prendasEnCamino,
		prendas_en_aduana: prendasEnAduana,
		vencer_pedido: vencerPedido,
		pausar_publicaciones_producto: pausarPublicacionesProducto,
	},
	lecturas: {
		pedidos_abiertos_de_variante: pedidosAbiertosDeVariante,
		pedidos_abiertos: pedidosAbiertos,
		folios_de_pedidos: foliosDePedidos,
	},
	semillas: [semillaDeParametrosDeLinea],
	// Tienda en línea ve sus W-; Aduana y Bodega, el W- sin precios ni pago (regla 8): el aviso solo lleva la tabla y
	// el id, y sus consultas recortan (fase 19).
	lectores: {
		pedidos_linea: ["linea", "aduana", "bodega"],
		pedido_linea_renglones: ["linea", "aduana", "bodega"],
	},
});
