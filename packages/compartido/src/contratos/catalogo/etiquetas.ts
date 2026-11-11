/**
 * El contrato de las etiquetas de Catálogo: el PDF de las etiquetas de prenda.
 * Fase 8 · docs/modulos/catalogo/variantes-codigos-y-etiquetas.md («`catalogo.imprimir_etiquetas`»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/**
 * Catálogo genera el PDF de etiquetas: por variante, o una por talla activa de unos productos. Lleva una de las
 * dos listas: la acción rechaza las dos juntas o ninguna con «Sin etiquetas».
 */
export const imprimirEtiquetas = definirAccion({
	nombre: "catalogo.imprimir_etiquetas",
	descripcion: "Genera el PDF de etiquetas de prenda; las pendientes quedan impresas",
	entrada: z.object({
		renglones: z
			.array(z.object({ variante_id: z.uuid(), cuantas: z.number().int().min(1, "Sin etiquetas") }))
			.optional()
			.describe("Por variante, cuántas"),
		producto_ids: z.array(z.uuid()).optional().describe("Una etiqueta por cada talla activa normal de esos productos"),
		solo_pendientes: z.boolean().optional().describe("Solo las por imprimir y por reimprimir"),
	}),
	salida: z.object({
		archivo_id: z.uuid().describe("El PDF"),
		url: z.string().describe("La dirección firmada del PDF"),
		etiquetas: z.number().int().describe("Cuántas etiquetas"),
	}),
	permiso: { departamento: "catalogo" },
	errores: [
		{ codigo: "talla_especial", mensaje: "Esa talla es de pedido especial: se etiqueta al fabricar el pedido." },
		{ codigo: "talla_dada_de_baja", mensaje: "Esa talla está dada de baja: su código ya no se imprime." },
		{ codigo: "talla_descontinuada", mensaje: "Esa talla está descontinuada: ya no se etiqueta." },
	],
});
