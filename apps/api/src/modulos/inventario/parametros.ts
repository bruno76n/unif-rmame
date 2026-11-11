/**
 * Los parámetros de `inventario`.
 * Fase 9 · docs/modulos/inventario/traspasos.md y reservas.md («Parámetros»)
 */

import { semillaDeParametros } from "../../nucleo/parametros.ts";

/** Los parámetros de `inventario`, con su valor inicial. */
export const semillaDeParametrosDeInventario = semillaDeParametros("inventario", [
	{
		clave: "inventario.horas_aduana_parado",
		seccion: "parametro",
		nombre: "Horas en aduana para «parado»",
		explicacion: "Desde aquí, lo que está en aduana sale en rojo",
		tipo: "entero",
		unidad: "horas",
		inicial: 72,
		minimo: 1,
		orden: 1,
	},
	{
		clave: "inventario.dias_aduana_ambar",
		seccion: "parametro",
		nombre: "Días en aduana para ámbar",
		explicacion: "Desde aquí, lo que está en aduana sale en ámbar",
		tipo: "entero",
		unidad: "días",
		inicial: 2,
		minimo: 1,
		orden: 2,
	},
	{
		clave: "inventario.dias_sin_confirmar_rojo",
		seccion: "parametro",
		nombre: "Días sin confirmar para rojo",
		explicacion: "Lo que va en camino o en tránsito sale en rojo",
		tipo: "entero",
		unidad: "días",
		inicial: 2,
		minimo: 1,
		orden: 3,
	},
	{
		clave: "inventario.dias_sin_confirmar_pastilla",
		seccion: "parametro",
		nombre: "Días sin confirmar para la pastilla de Aduana",
		explicacion: "Los despachos sin confirmar que cuentan en la pastilla de Aduana",
		tipo: "entero",
		unidad: "días",
		inicial: 1,
		minimo: 1,
		orden: 4,
	},
	{
		clave: "inventario.horas_reserva_pago_pendiente",
		seccion: "parametro",
		nombre: "Plazo de una reserva con pago pendiente",
		explicacion: "Si el pago no llega en este plazo, la reserva se libera",
		tipo: "entero",
		unidad: "horas",
		inicial: 24,
		minimo: 1,
		orden: 5,
	},
	{
		clave: "inventario.minutos_vencer_reservas",
		seccion: "tecnico",
		nombre: "Cada cuánto se buscan las reservas vencidas",
		tipo: "entero",
		unidad: "minutos",
		inicial: 5,
		minimo: 1,
		orden: 6,
	},
	{
		clave: "inventario.orden_surtido_linea",
		seccion: "parametro",
		nombre: "Orden de surtido en línea",
		explicacion:
			"Dónde se aparta un pedido en línea, en orden y separado por comas: bodega, aduana_a_bodega (lo que en aduana va a Bodega) y tiendas (la tienda sincronizada con más libres)",
		tipo: "texto",
		inicial: "bodega,aduana_a_bodega,tiendas",
		orden: 7,
	},
]);
