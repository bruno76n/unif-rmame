/**
 * Los parámetros que declara `compras`, con su valor inicial.
 * Fase 10 · docs/modulos/compras/proveedores-y-precios.md y materiales.md («Parámetros»)
 *
 * Los cambia solo la dueña, en Configuración.
 */

import { semillaDeParametros } from "../../nucleo/parametros.ts";

/** Los parámetros de `compras`. */
export const semillaDeParametrosDeCompras = semillaDeParametros("compras", [
	{
		clave: "compras.dias_dice_tardar_maximo",
		seccion: "parametro",
		nombre: "Lo más que un proveedor puede decir que tarda",
		tipo: "entero",
		unidad: "días",
		inicial: 90,
		minimo: 1,
		orden: 1,
	},
	{
		clave: "compras.umbral_cambio_precio_pct",
		seccion: "parametro",
		nombre: "Cambio de precio de compra que sale en ámbar",
		explicacion: "Un precio nuevo que cambia esto o más contra el anterior se marca; no detiene nada",
		tipo: "porcentaje",
		inicial: 15,
		minimo: 1,
		maximo: 100,
		orden: 2,
	},
	{
		clave: "compras.precio_max_centavos",
		seccion: "parametro",
		nombre: "Precio de compra más alto",
		explicacion: "El tope del costo y del precio de compra; es otro que el de los precios de venta",
		tipo: "centavos",
		inicial: 9_999_999,
		minimo: 1,
		orden: 3,
	},
	{
		clave: "compras.dias_cubre_inicial",
		seccion: "parametro",
		nombre: "Días que cubre el pedido de un material nuevo",
		explicacion: "Lo que propone «Cada pedido cubre» al dar de alta un material",
		tipo: "entero",
		unidad: "días",
		inicial: 60,
		minimo: 1,
		orden: 4,
	},
	{
		clave: "compras.dias_cubre_maximo",
		seccion: "parametro",
		nombre: "Lo más que puede cubrir un pedido",
		tipo: "entero",
		unidad: "días",
		inicial: 365,
		minimo: 1,
		orden: 5,
	},
]);
