/**
 * Los parámetros que declara `patronaje`: el rango de una medida, la tela por prenda, el corte próximo y el
 * desperdicio.
 * Fase 8 · docs/modulos/patronaje/recetas.md («Parámetros») y docs/fases/08-catalogo.md («Excepciones
 * permitidas»); fase 10 · recetas.md y cuenta-de-material.md («Parámetros»)
 *
 * El rango de una medida se siembra desde la fase 8, porque los tipos de prenda de Catálogo lo usan desde ahí.
 */

import { semillaDeParametros } from "../../nucleo/parametros.ts";

/** Los parámetros de `patronaje`, con su valor inicial. */
export const semillaDeParametrosDePatronaje = semillaDeParametros("patronaje", [
	{
		clave: "patronaje.medida_cm_min",
		seccion: "parametro",
		nombre: "Medida mínima de una prenda",
		explicacion: "La medida más chica, en centímetros, que se acepta en una receta o un tipo de prenda",
		tipo: "entero",
		unidad: "cm",
		inicial: 5,
		minimo: 1,
		orden: 1,
	},
	{
		clave: "patronaje.medida_cm_max",
		seccion: "parametro",
		nombre: "Medida máxima de una prenda",
		explicacion: "La medida más grande, en centímetros, que se acepta en una receta o un tipo de prenda",
		tipo: "entero",
		unidad: "cm",
		inicial: 250,
		minimo: 10,
		orden: 2,
	},
	{
		clave: "patronaje.tela_max_m_por_prenda",
		seccion: "parametro",
		nombre: "Tela más grande por prenda",
		explicacion: "Más tela por prenda en una talla es un error de captura",
		tipo: "entero",
		unidad: "m",
		inicial: 5,
		minimo: 1,
		orden: 3,
	},
	{
		clave: "patronaje.corte_proximo_dias",
		seccion: "parametro",
		nombre: "Corte próximo",
		explicacion: "Una prenda sin receta con un lote por cortar en estos días o menos sale primero en Patronaje",
		tipo: "entero",
		unidad: "días",
		inicial: 14,
		minimo: 1,
		orden: 4,
	},
	{
		clave: "patronaje.corte_urgente_dias",
		seccion: "parametro",
		nombre: "Corte urgente",
		explicacion: "Con estos días o menos para su corte, una prenda sin receta sale en rojo",
		tipo: "entero",
		unidad: "días",
		inicial: 7,
		minimo: 1,
		orden: 5,
	},
	{
		clave: "patronaje.desperdicio_estimado_pct",
		seccion: "parametro",
		nombre: "Desperdicio de una prenda sin cortes",
		explicacion: "El desperdicio de la tela principal mientras la prenda no tiene cortes medidos",
		tipo: "porcentaje",
		inicial: 6,
		minimo: 0,
		maximo: 100,
		orden: 6,
	},
	{
		clave: "patronaje.desperdicio_alto_pct",
		seccion: "parametro",
		nombre: "Desperdicio alto",
		explicacion: "Más que esto sale en rojo en Rendimiento y en los indicadores de Patronaje",
		tipo: "porcentaje",
		inicial: 10,
		minimo: 0,
		maximo: 100,
		orden: 7,
	},
	{
		clave: "patronaje.dato_flojo_lotes",
		seccion: "parametro",
		nombre: "Lotes para que el desperdicio sea firme",
		explicacion: "Con menos lotes medidos, el desperdicio de una prenda es dato flojo",
		tipo: "entero",
		unidad: "lotes",
		inicial: 3,
		minimo: 1,
		orden: 8,
	},
]);
