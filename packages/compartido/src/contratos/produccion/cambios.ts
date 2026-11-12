/**
 * El contrato de los cambios a pedido: Producción aplica a sus lotes lo que una versión del pedido dejó de más.
 * Fase 16 · docs/modulos/produccion/cambios-a-pedido.md («Acciones»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** Producción aplica a sus lotes el cambio más nuevo de un pedido. */
export const aplicarCambioPedido = definirAccion({
	nombre: "produccion.aplicar_cambio_pedido",
	descripcion: "Aplica a los lotes el cambio más nuevo de un pedido: resta de los que no se cortan y manda a Bodega",
	entrada: z.object({ cambio_pedido_id: z.uuid().describe("El cambio de pedido") }),
	salida: z.object({
		cambio_pedido_id: z.uuid().describe("El cambio que se aplicó: el más nuevo del pedido"),
		lineas: z.number().int().describe("Cuántos lotes y tallas se tocaron"),
	}),
	permiso: { departamento: "produccion" },
	errores: [{ codigo: "cambio_ya_aplicado", mensaje: "Ese cambio ya se aplicó." }],
	edita: true,
});
