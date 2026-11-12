/**
 * El módulo `contaduria`: los terceros (desde la fase 10, porque Compras los necesita), el crédito de los clientes, sus
 * cuentas por cobrar, los pagos, el saldo a favor y los anticipos.
 * Fase 10 · docs/modulos/contaduria/terceros-y-deudas.md y docs/fases/10-patronaje-y-compras.md («Excepciones
 * permitidas»)
 * Fase 15 · docs/modulos/contaduria/credito-de-clientes.md, cuentas-por-cobrar.md, pagos-y-saldo-a-favor.md y
 * anticipos.md
 * Fase 17 · docs/modulos/contaduria/facturas-de-proveedor.md, cuentas-por-pagar.md, terceros-y-deudas.md, gastos.md y
 * nomina.md
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import { accionCancelarCompensacion, accionCompensar } from "./acciones/compensaciones.ts";
import {
	accionCambiarDiasCredito,
	accionCambiarLimiteCredito,
	accionCambiarSemaforoCredito,
} from "./acciones/credito.ts";
import { accionAplicarDepositoATercero } from "./acciones/depositos.ts";
import { accionCancelarDeuda, accionRegistrarDeuda } from "./acciones/deudas.ts";
import {
	accionCancelarFacturaProveedor,
	accionCapturarFacturaProveedor,
	accionRegistrarNotaCreditoProveedor,
} from "./acciones/facturas.ts";
import { accionCancelarGasto, accionRegistrarGasto } from "./acciones/gastos.ts";
import { accionGuardarDescuentoSemanal, accionPagarNomina } from "./acciones/nomina.ts";
import { accionCancelarPago, accionRegistrarPagoRecibido } from "./acciones/pagos.ts";
import { accionPagarCuentaPorPagar, accionPedirPagoLoRecibido } from "./acciones/por-pagar.ts";
import { accionAplicarSaldoAFavor, accionDevolverSaldoAFavor } from "./acciones/saldo-favor.ts";
import { aplicarAnticipoANota, pasarAnticipoAFavor, regresarAnticipoAPedido } from "./internas/anticipos.ts";
import { abrirCreditoCliente } from "./internas/credito.ts";
import { aplicarNotaCredito, crearCuentaPorCobrar } from "./internas/cuentas.ts";
import { aplicarDecisionPagoFueraDeLoNormal, revisarFacturasDeOrden } from "./internas/facturas.ts";
import { registrarGastoMantenimiento } from "./internas/gastos.ts";
import { crearNominaSemana, estadoNominaSemana, moverFechaPagoNomina } from "./internas/nomina.ts";
import { crearTercero, renombrarTercero } from "./internas/terceros.ts";
import { anticipoDelPedidoLectura } from "./lecturas/anticipos.ts";
import { creditoDeCliente } from "./lecturas/credito.ts";
import { estadoPagoNotas, saldoPorCobrarDeCliente } from "./lecturas/cuentas.ts";
import { facturacionDeOrden } from "./lecturas/facturas.ts";
import { datosTerceros } from "./lecturas/terceros.ts";
import { semillaDeParametrosDeContaduria } from "./parametros.ts";
import { semillaDeCuentasFabrica, semillaDeListasDeGastos } from "./siembra.ts";

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
		accionCapturarFacturaProveedor,
		accionCancelarFacturaProveedor,
		accionRegistrarNotaCreditoProveedor,
		accionPagarCuentaPorPagar,
		accionPedirPagoLoRecibido,
		accionRegistrarDeuda,
		accionCancelarDeuda,
		accionCompensar,
		accionCancelarCompensacion,
		accionAplicarDepositoATercero,
		accionRegistrarGasto,
		accionCancelarGasto,
		accionGuardarDescuentoSemanal,
		accionPagarNomina,
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
		revisar_facturas_de_orden: revisarFacturasDeOrden,
		aplicar_decision_pago_fuera_de_lo_normal: aplicarDecisionPagoFueraDeLoNormal,
		registrar_gasto_mantenimiento: registrarGastoMantenimiento,
		crear_nomina_semana: crearNominaSemana,
		mover_fecha_pago_nomina: moverFechaPagoNomina,
	},
	efectosDeAutorizacion: { pago_fuera_de_lo_normal: "aplicar_decision_pago_fuera_de_lo_normal" },
	lecturas: {
		datos_terceros: datosTerceros,
		credito_de_cliente: creditoDeCliente,
		estado_pago_notas: estadoPagoNotas,
		saldo_por_cobrar_de_cliente: saldoPorCobrarDeCliente,
		anticipo_del_pedido: anticipoDelPedidoLectura,
		facturacion_de_orden: facturacionDeOrden,
		estado_nomina_semana: estadoNominaSemana,
	},
	semillas: [semillaDeParametrosDeContaduria, semillaDeCuentasFabrica, semillaDeListasDeGastos],
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
		// Compras recibe el aviso de que una factura de sus órdenes cambió y vuelve a leer `facturacion_de_orden`.
		facturas_proveedor: ["contaduria", "compras"],
		factura_proveedor_ordenes: ["contaduria"],
		cuentas_por_pagar: ["contaduria"],
		compensaciones: ["contaduria"],
		deudas: ["contaduria"],
		deuda_mensualidades: ["contaduria"],
		gastos: ["contaduria"],
		nominas: ["contaduria"],
		nomina_lineas: ["contaduria"],
		nomina_linea_piezas: ["contaduria"],
		descuentos_nomina: ["contaduria"],
	},
	// Los montos de la nómina y de los descuentos: la bitácora que los trae es sensible (`sensible_sueldos`).
	camposDeSueldo: [
		"descuento_semanal_centavos",
		"total_nomina_centavos",
		"total_tiempo_nomina_centavos",
		"total_piezas_nomina_centavos",
		"total_correcciones_nomina_centavos",
		"total_descontado_nomina_centavos",
	],
});
