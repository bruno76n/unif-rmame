/**
 * El módulo `contaduria`: los terceros (desde la fase 10, porque Compras los necesita), el crédito de los clientes, sus
 * cuentas por cobrar, los pagos, el saldo a favor y los anticipos.
 * Fase 10 · docs/modulos/contaduria/terceros-y-deudas.md y docs/fases/10-patronaje-y-compras.md («Excepciones
 * permitidas»)
 * Fase 15 · docs/modulos/contaduria/credito-de-clientes.md, cuentas-por-cobrar.md, pagos-y-saldo-a-favor.md y
 * anticipos.md
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
import { accionAplicarSaldoAFavor, accionDevolverSaldoAFavor } from "./acciones/saldo-favor.ts";
import { aplicarAnticipoANota, pasarAnticipoAFavor, regresarAnticipoAPedido } from "./internas/anticipos.ts";
import { abrirCreditoCliente } from "./internas/credito.ts";
import { aplicarNotaCredito, crearCuentaPorCobrar } from "./internas/cuentas.ts";
import { crearTercero, renombrarTercero } from "./internas/terceros.ts";
import { anticipoDelPedidoLectura } from "./lecturas/anticipos.ts";
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
		accionAplicarSaldoAFavor,
		accionDevolverSaldoAFavor,
	],
	internas: {
		crear_tercero: crearTercero,
		renombrar_tercero: renombrarTercero,
		abrir_credito_cliente: abrirCreditoCliente,
		crear_cuenta_por_cobrar: crearCuentaPorCobrar,
		aplicar_nota_credito: aplicarNotaCredito,
		aplicar_anticipo_a_nota: aplicarAnticipoANota,
		regresar_anticipo_a_pedido: regresarAnticipoAPedido,
		pasar_anticipo_a_favor: pasarAnticipoAFavor,
	},
	lecturas: {
		datos_terceros: datosTerceros,
		credito_de_cliente: creditoDeCliente,
		estado_pago_notas: estadoPagoNotas,
		saldo_por_cobrar_de_cliente: saldoPorCobrarDeCliente,
		anticipo_del_pedido: anticipoDelPedidoLectura,
	},
	semillas: [semillaDeParametrosDeContaduria, semillaDeCuentasFabrica],
	// El crédito, las cuentas, los pagos y el saldo a favor llevan montos: solo Contaduría. Ventas recibe el aviso de que
	// el crédito, una cuenta o un anticipo cambió (el aviso solo lleva la tabla) y vuelve a leer sus lecturas (decisiones
	// 664 y 675).
	lectores: {
		terceros: ["contaduria", "compras", "ventas", "direccion"],
		credito_clientes: ["contaduria", "ventas"],
		cuentas_por_cobrar: ["contaduria", "ventas"],
		pagos: ["contaduria"],
		aplicaciones_pago: ["contaduria"],
		saldo_favor_movimientos: ["contaduria"],
		anticipos: ["contaduria", "ventas"],
	},
});
