/**
 * Los parámetros que declara `calidad`: cuándo un lote es «Por revisar hoy» y la tasa de defectos.
 * Fase 13 · docs/modulos/calidad/revision-de-lotes.md («Parámetros»)
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
]);
