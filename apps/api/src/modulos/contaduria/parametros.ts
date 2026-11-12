/**
 * Los parámetros que declara `contaduria`: con cuántos días de crédito nace un cliente y cuándo sugiere el sistema
 * «Cerca del límite» o «Detenido».
 * Fase 15 · docs/modulos/contaduria/credito-de-clientes.md («Parámetros»)
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
]);
