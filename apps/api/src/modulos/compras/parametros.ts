/**
 * Los parámetros que declara `compras`, con su valor inicial.
 * Fase 10 · docs/modulos/compras/proveedores-y-precios.md, materiales.md y ordenes-de-compra.md («Parámetros»)
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
	{
		clave: "compras.cantidad_maxima_linea",
		seccion: "parametro",
		nombre: "Cantidad más grande en una línea de una orden",
		explicacion: "Más que esto en una línea es «Es demasiado: revisa la cantidad»",
		tipo: "entero",
		inicial: 999_999,
		minimo: 1,
		orden: 6,
	},
	{
		clave: "compras.dias_max_fecha_prometida",
		seccion: "parametro",
		nombre: "Lo más lejos que puede prometer llegar una orden",
		tipo: "entero",
		unidad: "días",
		inicial: 120,
		minimo: 1,
		orden: 7,
	},
	{
		clave: "compras.dias_espera_orden_atrasada",
		seccion: "parametro",
		nombre: "Días en que se espera una orden atrasada",
		explicacion: "Una orden atrasada se espera en estos días: en Compras, en Aduana y en la revisión de Ventas",
		tipo: "entero",
		unidad: "días",
		inicial: 3,
		minimo: 0,
		orden: 8,
	},
]);
