/**
 * El contrato del hilo del pedido: las seis paradas de cada prenda, sus lotes con su salud y lo de más por talla.
 * Fase 19 · docs/interfaz/comunes.md («El hilo del pedido», «`produccion.hilo_pedido`») y docs/interfaz/TEXTOS.md
 * («El hilo»)
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";

/** Las seis paradas, en orden. */
export const paradasDelHilo = ["pedido", "corte", "costura", "calidad", "aduana", "entrega"] as const;

/** Cómo se pinta la línea corta de una parada. */
export const tonosDelHilo = ["normal", "ambar", "rojo"] as const;

export const hiloPedido = definirConsulta({
	nombre: "produccion.hilo_pedido",
	descripcion:
		"El hilo de un pedido: por prenda, las seis paradas con sus piezas y su línea, y sus lotes con su salud. Sin dinero",
	entrada: z.object({
		pedido_id: z.uuid(),
		producto_id: z.uuid().optional().describe("Solo esa prenda"),
	}),
	salida: z.object({
		prendas: z.array(
			z.object({
				producto_id: z.uuid(),
				prenda: z.string(),
				paradas: z.array(
					z.object({
						parada: z.enum(paradasDelHilo),
						piezas: z.number().int(),
						linea: z.string(),
						tono: z.enum(tonosDelHilo),
					}),
				),
				lotes: z.array(
					z.object({ lote_id: z.uuid(), folio: z.string(), estado: z.string(), salud: z.string().nullable() }),
				),
				de_mas: z.array(z.object({ talla: z.string(), piezas: z.number().int() })),
			}),
		),
	}),
	permiso: { departamento: ["produccion", "ventas"] },
});
