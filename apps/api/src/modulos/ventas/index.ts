/**
 * El módulo `ventas`: los clientes externos.
 * Fase 16 · docs/modulos/ventas/clientes.md
 *
 * Los pedidos, mandar a producción, las notas de entrega y las notas de crédito llegan en las partes siguientes de la
 * fase 16.
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import {
	accionCrearCliente,
	accionDarBajaCliente,
	accionEditarCliente,
	accionReactivarCliente,
} from "./acciones/clientes.ts";
import { clienteActivoDeEscuela, estadoCliente } from "./lecturas/clientes.ts";

export default definirModulo({
	nombre: "ventas",
	acciones: [accionCrearCliente, accionEditarCliente, accionDarBajaCliente, accionReactivarCliente],
	lecturas: { estado_cliente: estadoCliente, cliente_activo_de_escuela: clienteActivoDeEscuela },
	// Los clientes los leen Ventas y Contaduría (su crédito y su cobranza), Calidad (sus reclamos) y Dirección.
	lectores: { clientes: ["ventas", "contaduria", "calidad", "direccion", "aduana"] },
});
