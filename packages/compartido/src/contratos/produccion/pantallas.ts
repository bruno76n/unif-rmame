/**
 * Las piezas que comparten los contratos de las pantallas de Producción: para quién es un lote, su estado ya escrito
 * con su color y la tira de operaciones.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Lotes»: la tarjeta, la tira y los estados del lote)
 */

import { z } from "zod";
import { colorDeEstado } from "../estados.ts";

/** Un estado ya escrito: su texto, su color y su línea de abajo. */
export const estadoEscrito = z.object({
	texto: z.string().describe("El estado, como sale en el cuadro («Atorado en Costados», «En tiempo»)"),
	color: colorDeEstado,
	linea: z.string().describe("La línea de abajo («Faltan 40», «Desde el 13 oct»); vacía si no lleva"),
});

/** Para quién es un lote o una orden: el cliente con su color, una tienda o la temporada. */
export const paraQuien = z.object({
	tipo: z.enum(["pedido", "tienda", "temporada"]).describe("El destino"),
	nombre: z.string().describe("El cliente, la tienda o «Temporada · bodega»"),
	color: z.string().nullable().describe("El color de la escuela del cliente; vacío si no tiene"),
	linea: z.string().describe("«PE-0149 · para el 3 nov», «Reabasto · para el 31 oct» o «Para el 20 nov»"),
	pedido_id: z.uuid().nullable().describe("El pedido, si es de un pedido"),
});

/** Una casilla de la tira de operaciones de un lote. */
export const casillaDeLaTira = z.object({
	operacion: z.string().describe("El nombre de la operación"),
	hechas: z.number().int().describe("Las buenas de sus registros vigentes"),
	cortadas: z.number().int().describe("Las cortadas del lote"),
	puede_hasta: z.number().int().describe("Lo que puede reportar: lo que hizo la anterior (la primera, las cortadas)"),
	marca: z.enum(["se_junta", "atorado"]).nullable().describe("El cuello de botella o la operación atorada"),
});

/** Cómo va la receta de una prenda. */
export const recetaDeLaPrenda = z
	.enum(["verificada", "sin_verificar", "sin_receta"])
	.describe("Si la prenda tiene receta y si está verificada contra un corte");
