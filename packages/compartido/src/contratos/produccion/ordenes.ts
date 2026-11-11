/**
 * Los contratos de las órdenes de producción: levantar una para Bodega o una tienda.
 * Fase 12 · docs/modulos/produccion/ordenes-de-produccion.md («`produccion.crear_orden`»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** Producción levanta una orden de temporada (para Bodega) o de reabasto (para una tienda), con su lote. */
export const crearOrden = definirAccion({
	nombre: "produccion.crear_orden",
	descripcion: "Levanta una orden de producción para Bodega o una tienda, con su lote por cortar",
	entrada: z.object({
		ubicacion_destino_id: z
			.uuid("Escoge para quién es: temporada o una tienda.")
			.describe("«Para»: Bodega o una tienda"),
		producto_id: z.uuid("Escoge la prenda.").describe("La prenda"),
		tallas: z
			.array(
				z.object({
					variante_id: z.uuid().describe("La talla de la prenda"),
					piezas: z.number("Pon las piezas por talla.").int().nonnegative().describe("Las piezas, de 0 en adelante"),
				}),
				"Pon las piezas por talla.",
			)
			.min(1, "Pon las piezas por talla.")
			.describe("Las piezas por talla; las que van en 0 no se guardan"),
		fecha_entrega: z.iso.date("¿Para cuándo?").describe("«Para cuándo»"),
		motivo: z.string().trim().max(120, "El motivo va en 120 letras.").optional().describe("El motivo, como referencia"),
	}),
	salida: z.object({
		orden_produccion_id: z.uuid().describe("La orden"),
		folio: z.string().describe("Su folio OP-"),
		lote_id: z.uuid().describe("Su lote por cortar"),
		lote_folio: z.string().describe("El folio L- del lote"),
	}),
	permiso: { departamento: "produccion" },
	errores: [
		{ codigo: "prenda_no_se_fabrica", mensaje: "{prenda} no pasa por el taller." },
		{ codigo: "talla_descontinuada", mensaje: "La talla {t} ya no se fabrica." },
		{ codigo: "fecha_pasada", mensaje: "La fecha no puede ser antes de hoy." },
		{ codigo: "destino_no_valido", mensaje: "Escoge para quién es: temporada o una tienda." },
	],
});
