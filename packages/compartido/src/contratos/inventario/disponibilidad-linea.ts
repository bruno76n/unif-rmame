/**
 * El contrato de `inventario.disponibilidad_linea`: qué se le puede prometer al cliente en línea, por talla.
 * Fase 19 · docs/interfaz/fabrica/tienda-en-linea.md («Disponibilidad»)
 *
 * La promesa es la misma cuenta del orden de surtido de las reservas (docs/modulos/inventario/reservas.md): lo que se
 * ve aquí es lo que el W- promete al llegar. La pantalla solo la pinta.
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";

/** Lo que se le promete a una talla. */
export const promesasDeDisponibilidad = ["sale_hoy", "sale_manana", "agotado"] as const;

/** Una lista de ids separados por comas, como viaja en la dirección. */
const listaDeIds = z
	.string()
	.regex(/^[0-9a-fA-F-]{36}(,[0-9a-fA-F-]{36})*$/)
	.describe("Ids separados por comas");

/** La disponibilidad en línea, por producto y talla. */
export const disponibilidadLinea = definirConsulta({
	nombre: "inventario.disponibilidad_linea",
	descripcion:
		"Por talla de los productos activos que se venden en línea (sin las de pedido especial): sale hoy, sale mañana o agotado",
	entrada: z.object({
		producto_id: z.uuid().optional().describe("Solo las tallas de ese producto"),
		variante_ids: listaDeIds.optional().describe("Solo esas variantes"),
	}),
	salida: z.object({
		productos: z
			.array(
				z.object({
					producto_id: z.uuid(),
					nombre: z.string(),
					tallas: z
						.array(
							z.object({
								variante_id: z.uuid(),
								talla: z.string(),
								promesa: z.enum(promesasDeDisponibilidad),
								texto: z.string().describe("«Sale hoy: hay en bodega», «Sale mañana: está en una tienda» o «Agotado»"),
							}),
						)
						.describe("En el orden de sus tallas; vacía si no tiene ninguna: «Sin existencia»"),
				}),
			)
			.describe("Por nombre"),
		conteos: z.object({
			sale_hoy: z.number().int(),
			sale_manana: z.number().int(),
			agotado: z.number().int(),
		}),
	}),
	permiso: { departamento: ["linea", "bodega"] },
});
