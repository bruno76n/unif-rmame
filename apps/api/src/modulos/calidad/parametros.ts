/**
 * Los parámetros que declara `calidad`: cuándo un lote es «Por revisar hoy», la tasa de defectos y lo menos que dice
 * un reclamo.
 * Fase 13 · docs/modulos/calidad/revision-de-lotes.md y reclamos-y-devoluciones.md («Parámetros»)
 */

import { semillaDeParametros } from "../../nucleo/parametros.ts";

/** Los parámetros de `calidad`, con su valor inicial. */
export const semillaDeParametrosDeCalidad = semillaDeParametros("calidad", [
	{
		clave: "calidad.por_revisar_hoy_dias",
		seccion: "parametro",
		nombre: "Por revisar hoy",
		explicacion: "Un lote que se entrega en estos días o menos es «Por revisar hoy»",
		tipo: "entero",
		unidad: "días",
		inicial: 1,
		minimo: 0,
		maximo: 30,
		orden: 1,
	},
	{
		clave: "calidad.defectos_periodo_dias",
		seccion: "parametro",
		nombre: "Periodo de la tasa de defectos",
		explicacion: "Los días hacia atrás que cuenta la tasa de defectos",
		tipo: "entero",
		unidad: "días",
		inicial: 30,
		minimo: 7,
		maximo: 365,
		orden: 2,
	},
	{
		clave: "calidad.defectos_tasa_roja_porcentaje",
		seccion: "parametro",
		nombre: "Tasa de defectos en rojo",
		explicacion: "Arriba de esto, la tasa de defectos de una operación o una persona sale en rojo",
		tipo: "porcentaje",
		inicial: 2,
		minimo: 0,
		maximo: 100,
		orden: 3,
	},
	{
		clave: "calidad.reclamo_min_letras",
		seccion: "parametro",
		nombre: "Lo que dice el cliente",
		explicacion: "Lo menos que lleva «Qué dice el cliente» en un reclamo",
		tipo: "entero",
		unidad: "letras",
		inicial: 10,
		minimo: 1,
		maximo: 200,
		orden: 4,
	},
]);
