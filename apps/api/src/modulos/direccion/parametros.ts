/**
 * Los parámetros que declara `direccion`.
 * Fase 7 · docs/modulos/direccion/autorizaciones.md («Parámetros»)
 */

import { semillaDeParametros } from "../../nucleo/parametros.ts";

/** Los parámetros de `direccion`, con su valor inicial. */
export const semillaDeParametrosDeDireccion = semillaDeParametros("direccion", [
	{
		clave: "direccion.autorizacion_dias_rojo",
		seccion: "parametro",
		nombre: "Días para que una autorización se vea en rojo",
		explicacion: "Desde cuántos días esperando la tarjeta dice «Por autorizar · {n} días» en rojo",
		tipo: "entero",
		unidad: "días",
		inicial: 2,
		minimo: 1,
		orden: 1,
	},
	{
		clave: "direccion.autorizacion_dias_menu_rojo",
		seccion: "parametro",
		nombre: "Días para que el menú de Dirección se vea en rojo",
		explicacion: "Desde cuántos días esperando el conteo del menú de Dirección se pone rojo",
		tipo: "entero",
		unidad: "días",
		inicial: 3,
		minimo: 1,
		orden: 2,
	},
]);
