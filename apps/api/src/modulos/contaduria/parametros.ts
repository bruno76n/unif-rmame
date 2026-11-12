/**
 * Los parámetros que declara `contaduria`: con cuántos días de crédito nace un cliente, cuándo sugiere el sistema
 * «Cerca del límite» o «Detenido», los tramos de la antigüedad de saldos y la ventana de los pagos.
 * Fase 15 · docs/modulos/contaduria/credito-de-clientes.md y docs/modulos/contaduria/cuentas-por-cobrar.md
 * («Parámetros»)
 * Fase 17 · docs/modulos/contaduria/cuentas-por-pagar.md («Parámetros»)
 */

import { semillaDeParametros } from "../../nucleo/parametros.ts";

/** Los parámetros de `contaduria`, con su valor inicial. */
export const semillaDeParametrosDeContaduria = semillaDeParametros("contaduria", [
	{
		clave: "contaduria.credito_dias_mayorista",
		seccion: "parametro",
		nombre: "Días de crédito de un mayorista nuevo",
		explicacion: "Los días de crédito con que nace un cliente mayorista",
		tipo: "entero",
		unidad: "días",
		inicial: 15,
		minimo: 1,
		orden: 1,
	},
	{
		clave: "contaduria.credito_dias_general",
		seccion: "parametro",
		nombre: "Días de crédito de los demás clientes nuevos",
		explicacion: "Los días de crédito con que nacen las escuelas y los demás clientes",
		tipo: "entero",
		unidad: "días",
		inicial: 30,
		minimo: 1,
		orden: 2,
	},
	{
		clave: "contaduria.credito_porcentaje_cerca_limite",
		seccion: "parametro",
		nombre: "Uso del límite que está cerca",
		explicacion: "Arriba de este uso del límite el sistema sugiere «Cerca del límite» y la barra sale en ámbar",
		tipo: "porcentaje",
		inicial: 80,
		minimo: 1,
		maximo: 100,
		orden: 3,
	},
	{
		clave: "contaduria.credito_dias_vencido_detenido",
		seccion: "parametro",
		nombre: "Días de vencido que detienen",
		explicacion: "Con algo vencido hace más de estos días el sistema sugiere «Detenido»",
		tipo: "entero",
		unidad: "días",
		inicial: 30,
		minimo: 1,
		orden: 4,
	},
	{
		clave: "contaduria.antiguedad_tramos_dias",
		seccion: "parametro",
		nombre: "Tramos de la antigüedad de saldos",
		explicacion:
			"Los días vencidos donde corta cada tramo, separados por comas: por vencer, 1 a 15, 16 a 30 y más de 30",
		tipo: "texto",
		inicial: "15,30",
		orden: 5,
	},
	{
		clave: "contaduria.ventana_dias",
		seccion: "parametro",
		nombre: "Días de la ventana de pagos",
		explicacion: "El flujo neto, «vencen esta semana» y los pagos en Pendientes miran estos días",
		tipo: "entero",
		unidad: "días",
		inicial: 7,
		minimo: 1,
		orden: 6,
	},
	{
		clave: "contaduria.pago_atrasado_rojo_dias",
		seccion: "parametro",
		nombre: "Días de un pago atrasado en rojo",
		explicacion: "Desde cuántos días de vencido un pago pone en rojo el conteo del menú",
		tipo: "entero",
		unidad: "días",
		inicial: 7,
		minimo: 1,
		orden: 7,
	},
]);
