/**
 * Los parámetros que declara `linea`.
 * Fase 18 · docs/modulos/linea/pedidos-en-linea.md («Parámetros»)
 */

import { semillaDeParametros } from "../../nucleo/parametros.ts";

/** Los parámetros de `linea`, con su valor inicial. */
export const semillaDeParametrosDeLinea = semillaDeParametros("linea", [
	{
		clave: "linea.acepta_pago_pendiente",
		seccion: "decision_operacion",
		nombre: "Aceptar pedidos con pago pendiente",
		explicacion:
			"Si entra un pedido en línea con pago pendiente (OXXO, transferencia). El sitio no lo ofrece mientras diga que no",
		tipo: "booleano",
		inicial: false,
		orden: 1,
	},
	{
		clave: "linea.dias_pedido_rojo",
		seccion: "parametro",
		nombre: "Días para que un pedido en línea se vea en rojo",
		explicacion: "Desde cuántos días de pagado un pedido abierto se pone en rojo en Pendientes de Tienda en línea",
		tipo: "entero",
		unidad: "días",
		inicial: 2,
		minimo: 1,
		orden: 2,
	},
]);
