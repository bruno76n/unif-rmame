/**
 * El módulo `ventas`: los clientes externos y sus pedidos.
 * Fase 16 · docs/modulos/ventas/clientes.md y docs/modulos/ventas/pedidos.md
 *
 * Mandar a producción, las notas de entrega y las notas de crédito llegan en las partes siguientes de la fase 16.
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import {
	accionCrearCliente,
	accionDarBajaCliente,
	accionEditarCliente,
	accionReactivarCliente,
} from "./acciones/clientes.ts";
import {
	accionCancelarPedido,
	accionConfirmarPedido,
	accionGuardarBorradorPedido,
	accionGuardarVersionPedido,
} from "./acciones/pedidos.ts";
import { clienteActivoDeEscuela, estadoCliente } from "./lecturas/clientes.ts";
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
	],
	lecturas: {
		estado_cliente: estadoCliente,
		cliente_activo_de_escuela: clienteActivoDeEscuela,
		avance_pedido: avancePedido,
		pedido_para_cobro: pedidoParaCobro,
		pedidos_abiertos_de_variante: pedidosAbiertosDeVariante,
	},
	semillas: [semillaDeParametrosDeVentas],
	// Los clientes los leen Ventas y Contaduría (su crédito y su cobranza), Calidad (sus reclamos) y Dirección.
	// Los pedidos llevan precios: Ventas, Contaduría y Dirección; Producción ve el pedido sin precios en sus consultas.
	lectores: {
		clientes: ["ventas", "contaduria", "calidad", "direccion", "aduana"],
		pedidos: ["ventas", "contaduria", "produccion", "direccion"],
		pedido_renglones: ["ventas", "contaduria", "produccion", "direccion"],
		pedido_versiones: ["ventas", "direccion"],
	},
});
