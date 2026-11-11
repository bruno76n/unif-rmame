/**
 * Los contratos de las recepciones en aduana: recibir lo que llega de un proveedor.
 * Fase 11 · docs/modulos/inventario/recepciones-en-aduana.md («`inventario.recibir_de_proveedor`»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** Un rollo que llega: sus metros marcados (un decimal como máximo) y el código de la partida del proveedor. */
const rolloQueLlega = z.object({
	metros: z
		.string("Metros")
		.trim()
		.regex(/^\d{1,6}(\.\d)?$/, "Metros")
		.refine((texto) => Number(texto) > 0, "Metros")
		.describe("Los metros marcados del rollo, mayores que 0, con un decimal como máximo"),
	partida: z
		.string("Partida")
		.trim()
		.min(1, "Partida")
		.max(20, "Partida")
		.describe("El código de la etiqueta del proveedor; se guarda en mayúsculas"),
});

/** Aduana recibe lo que llegó de una orden de compra: la tela rollo por rollo y lo demás por cantidad. */
export const recibirDeProveedor = definirAccion({
	nombre: "inventario.recibir_de_proveedor",
	descripcion: "Recibe en aduana lo que llegó de una orden de compra: nacen sus rollos, sus partidas y su A- a Bodega",
	entrada: z.object({
		orden_compra_id: z.uuid().describe("La orden"),
		materiales: z
			.array(
				z.object({
					orden_compra_linea_id: z.uuid().describe("La línea de la orden"),
					rollos: z.array(rolloQueLlega).optional().describe("Si es tela: al menos uno"),
					cantidad: z
						.string("Cantidad")
						.trim()
						.regex(/^\d{1,9}(\.\d{1,3})?$/, "Cantidad")
						.optional()
						.describe("Si no es tela: de 0 en adelante; entera si su unidad se cuenta entera"),
				}),
			)
			.min(1, "Escoge lo que llegó")
			.describe("Uno por línea que llega"),
	}),
	salida: z.object({
		recepcion_id: z.uuid().describe("La recepción"),
		traspaso_id: z.uuid().describe("El A- del material, en aduana con destino Bodega"),
		folio: z.string().describe("El folio del A-"),
		rollos: z.array(z.object({ rollo_id: z.uuid(), folio: z.string() })).describe("Los rollos que nacieron"),
	}),
	permiso: { departamento: "aduana" },
	errores: [
		{ codigo: "orden_no_recibible", mensaje: "{OC} no se puede recibir: está {estado}" },
		{ codigo: "linea_ajena", mensaje: "{material} no es de {OC}." },
	],
});
