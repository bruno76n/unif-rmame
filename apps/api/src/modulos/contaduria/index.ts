/**
 * El módulo `contaduria`: los terceros (desde la fase 10, porque Compras los necesita), el crédito de los clientes, sus
 * cuentas por cobrar y los pagos.
 * Fase 10 · docs/modulos/contaduria/terceros-y-deudas.md y docs/fases/10-patronaje-y-compras.md («Excepciones
 * permitidas»)
 * Fase 15 · docs/modulos/contaduria/credito-de-clientes.md, cuentas-por-cobrar.md y pagos-y-saldo-a-favor.md
 *
 * Las cuentas por pagar, las deudas y la nómina llegan en la fase 17.
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import {
	accionCambiarDiasCredito,
	accionCambiarLimiteCredito,
	accionCambiarSemaforoCredito,
} from "./acciones/credito.ts";
import { accionCancelarPago, accionRegistrarPagoRecibido } from "./acciones/pagos.ts";
import { abrirCreditoCliente } from "./internas/credito.ts";
import { aplicarNotaCredito, crearCuentaPorCobrar } from "./internas/cuentas.ts";
import { crearTercero, renombrarTercero } from "./internas/terceros.ts";
import { creditoDeCliente } from "./lecturas/credito.ts";
import { estadoPagoNotas, saldoPorCobrarDeCliente } from "./lecturas/cuentas.ts";
import { datosTerceros } from "./lecturas/terceros.ts";
import { semillaDeParametrosDeContaduria } from "./parametros.ts";
import { semillaDeCuentasFabrica } from "./siembra.ts";

export default definirModulo({
	nombre: "contaduria",
	acciones: [
		accionCambiarLimiteCredito,
		accionCambiarDiasCredito,
		accionCambiarSemaforoCredito,
		accionRegistrarPagoRecibido,
		accionCancelarPago,
	],
	internas: {
		crear_tercero: crearTercero,
		renombrar_tercero: renombrarTercero,
		abrir_credito_cliente: abrirCreditoCliente,
		crear_cuenta_por_cobrar: crearCuentaPorCobrar,
		aplicar_nota_credito: aplicarNotaCredito,
	},
	lecturas: {
		datos_terceros: datosTerceros,
		credito_de_cliente: creditoDeCliente,
		estado_pago_notas: estadoPagoNotas,
		saldo_por_cobrar_de_cliente: saldoPorCobrarDeCliente,
	},
	semillas: [semillaDeParametrosDeContaduria, semillaDeCuentasFabrica],
	// El crédito, las cuentas, los pagos y el saldo a favor llevan montos: solo Contaduría. Ventas recibe el aviso de que
	// el crédito o una cuenta cambió y vuelve a leer sus lecturas, sin montos (decisión 664).
	lectores: {
		terceros: ["contaduria", "compras", "ventas", "direccion"],
		credito_clientes: ["contaduria", "ventas"],
		cuentas_por_cobrar: ["contaduria", "ventas"],
		pagos: ["contaduria"],
		aplicaciones_pago: ["contaduria"],
		saldo_favor_movimientos: ["contaduria"],
	},
});
