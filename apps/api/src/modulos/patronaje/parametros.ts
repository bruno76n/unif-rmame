/**
 * Los parámetros que declara `patronaje`: por ahora, el rango de una medida en centímetros.
 * Fase 8 · docs/modulos/patronaje/recetas.md («Parámetros») y docs/fases/08-catalogo.md («Excepciones
 * permitidas»)
 *
 * Son de Patronaje, pero se siembran en la fase 8 porque los tipos de prenda de Catálogo los usan desde ahí.
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
]);
