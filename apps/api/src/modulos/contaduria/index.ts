/**
 * El módulo `contaduria`: los terceros (desde la fase 10, porque Compras los necesita) y el crédito de los clientes.
 * Fase 10 · docs/modulos/contaduria/terceros-y-deudas.md y docs/fases/10-patronaje-y-compras.md («Excepciones
 * permitidas»)
 * Fase 15 · docs/modulos/contaduria/credito-de-clientes.md
 *
 * Las cuentas por pagar, las deudas y la nómina llegan en la fase 17.
 */

import { definirModulo } from "../../nucleo/modulos.ts";
import {
	accionCambiarDiasCredito,
	accionCambiarLimiteCredito,
	accionCambiarSemaforoCredito,
} from "./acciones/credito.ts";
import { abrirCreditoCliente } from "./internas/credito.ts";
import { crearTercero, renombrarTercero } from "./internas/terceros.ts";
import { creditoDeCliente } from "./lecturas/credito.ts";
import { datosTerceros } from "./lecturas/terceros.ts";
import { semillaDeParametrosDeContaduria } from "./parametros.ts";

export default definirModulo({
	nombre: "contaduria",
	acciones: [accionCambiarLimiteCredito, accionCambiarDiasCredito, accionCambiarSemaforoCredito],
	internas: {
		crear_tercero: crearTercero,
		renombrar_tercero: renombrarTercero,
		abrir_credito_cliente: abrirCreditoCliente,
	},
	lecturas: { datos_terceros: datosTerceros, credito_de_cliente: creditoDeCliente },
	semillas: [semillaDeParametrosDeContaduria],
	// El crédito y las cuentas por cobrar llevan montos: solo Contaduría. Ventas recibe el aviso de que el crédito
	// cambió y vuelve a leer `credito_de_cliente`, sin montos.
	lectores: {
		terceros: ["contaduria", "compras", "ventas", "direccion"],
		credito_clientes: ["contaduria", "ventas"],
		cuentas_por_cobrar: ["contaduria"],
	},
});
