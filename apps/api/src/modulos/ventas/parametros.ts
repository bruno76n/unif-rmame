/**
 * Los parámetros que declara `ventas`: con qué forma de pago abre un pedido, lo más que lleva una talla y los días de
 * las alertas de entrega.
 * Fase 16 · docs/modulos/ventas/pedidos.md («Parámetros»)
 */

import { semillaDeParametros } from "../../nucleo/parametros.ts";

/** Los parámetros de `ventas`, con su valor inicial. */
export const semillaDeParametrosDeVentas = semillaDeParametros("ventas", [
	{
		clave: "ventas.forma_pago_inicial",
		seccion: "parametro",
		nombre: "Forma de pago con que abre un pedido",
		explicacion: "La forma de pago que trae escogida un pedido nuevo",
		tipo: "opcion",
		opciones: ["contado", "anticipo", "credito"],
		inicial: "anticipo",
		orden: 1,
	},
	{
		clave: "ventas.piezas_max_talla",
		seccion: "parametro",
		nombre: "Lo más que lleva una talla de un pedido",
		explicacion: "Las piezas de una talla van de 0 a este número",
		tipo: "entero",
		unidad: "piezas",
		inicial: 9_999,
		minimo: 1,
		orden: 2,
	},
	{
		clave: "ventas.dias_en_riesgo",
		seccion: "parametro",
		nombre: "Días para «En riesgo de atraso»",
		explicacion: "Con la entrega a estos días o menos y lo listo sin cubrir lo que falta, el pedido sale en riesgo",
		tipo: "entero",
		unidad: "días",
		inicial: 3,
		minimo: 0,
		orden: 3,
	},
	{
		clave: "ventas.dias_entregas_proximas",
		seccion: "parametro",
		nombre: "Días de «Entregas próximas»",
		explicacion: "El indicador de las entregas que vienen en estos días",
		tipo: "entero",
		unidad: "días",
		inicial: 7,
		minimo: 1,
		orden: 4,
	},
]);
