/**
 * El módulo `ventas`: los clientes externos, sus pedidos, mandarlos a producción y sus notas de entrega y de crédito.
 * Fase 16 · docs/modulos/ventas/ (clientes, pedidos, mandar a producción, notas de entrega y notas de crédito)
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import {
	accionCrearCliente,
	accionDarBajaCliente,
	accionEditarCliente,
	accionReactivarCliente,
} from "./acciones/clientes.ts";
import { accionMandarAProduccion, accionSurtirDeBodega } from "./acciones/mandar.ts";
import {
	accionArmarNotaEntrega,
	accionCancelarNotaEntrega,
	accionConfirmarEntrega,
	accionPasarABodega,
	marcarNotaEnCamino,
} from "./acciones/notas.ts";
import { accionPedirNotaCredito, aplicarDecisionNotaCredito } from "./acciones/notas-credito.ts";
import {
	accionCancelarPedido,
	accionConfirmarPedido,
	accionGuardarBorradorPedido,
	accionGuardarVersionPedido,
} from "./acciones/pedidos.ts";
import { clienteActivoDeEscuela, estadoCliente } from "./lecturas/clientes.ts";
import { documentosAbiertos, foliosDeDocumentos } from "./lecturas/documentos.ts";
import { avancePedido, pedidoParaCobro, pedidosAbiertosDeVariante } from "./lecturas/pedidos.ts";
import { semillaDeParametrosDeVentas } from "./parametros.ts";

export default definirModulo({
	nombre: "ventas",
	acciones: [
		accionCrearCliente,
		accionEditarCliente,
		accionDarBajaCliente,
		accionReactivarCliente,
		accionGuardarBorradorPedido,
		accionConfirmarPedido,
		accionGuardarVersionPedido,
		accionCancelarPedido,
		accionMandarAProduccion,
		accionSurtirDeBodega,
		accionArmarNotaEntrega,
		accionCancelarNotaEntrega,
		accionConfirmarEntrega,
		accionPasarABodega,
		accionPedirNotaCredito,
	],
	internas: {
		marcar_nota_en_camino: marcarNotaEnCamino,
		aplicar_decision_nota_credito: aplicarDecisionNotaCredito,
	},
	efectosDeAutorizacion: { nota_credito: "aplicar_decision_nota_credito" },
	lecturas: {
		estado_cliente: estadoCliente,
		cliente_activo_de_escuela: clienteActivoDeEscuela,
		avance_pedido: avancePedido,
		pedido_para_cobro: pedidoParaCobro,
		pedidos_abiertos_de_variante: pedidosAbiertosDeVariante,
		documentos_abiertos: documentosAbiertos,
		folios_de_documentos: foliosDeDocumentos,
	},
	semillas: [semillaDeParametrosDeVentas],
	// Los clientes los leen Ventas y Contaduría (su crédito y su cobranza), Calidad (sus reclamos), Aduana (a quién
	// despacha) y Dirección. Las notas llevan precios: Ventas, Contaduría y Dirección; Aduana las ve sin precios.
	// Los pedidos llevan precios: Ventas, Contaduría y Dirección; Producción ve el pedido sin precios en sus consultas.
	lectores: {
		clientes: ["ventas", "contaduria", "calidad", "direccion", "aduana"],
		pedidos: ["ventas", "contaduria", "produccion", "direccion"],
		pedido_renglones: ["ventas", "contaduria", "produccion", "direccion"],
		pedido_versiones: ["ventas", "direccion"],
		notas_entrega: ["ventas", "contaduria", "direccion"],
		nota_entrega_lineas: ["ventas", "contaduria", "direccion"],
		notas_credito: ["ventas", "contaduria", "direccion"],
		nota_credito_lineas: ["ventas", "contaduria", "direccion"],
	},
});
