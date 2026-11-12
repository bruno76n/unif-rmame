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

/** Aduana recibe lo que viene en camino de Bodega o de una tienda: completo, o con lo que contó. */
export const recibirEnAduana = definirAccion({
	nombre: "inventario.recibir_en_aduana",
	descripcion: "Recibe en aduana lo que viene en camino, completo o con diferencias",
	entrada: z.object({
		traspaso_id: z.uuid().describe("El traspaso"),
		modo: z.enum(["completo", "con_diferencias"]).describe("«Llegó completo» o «Llegó con diferencias»"),
		renglones: z
			.array(
				z.object({
					traspaso_linea_id: z.uuid().describe("El renglón del traspaso"),
					piezas: z.number().int().nonnegative().optional().describe("Las piezas que llegaron, si es prenda"),
					cantidad: z
						.string()
						.trim()
						.regex(/^\d{1,9}(\.\d{1,3})?$/)
						.optional()
						.describe("Lo que llegó, si es material"),
					con_defecto: z.boolean().optional().describe("Solo en una devolución: si llegó con defecto, para Calidad"),
					defecto_id: z.uuid().optional().describe("Solo en una devolución con defecto: cuál"),
				}),
			)
			.optional()
			.describe("Obligatorios con diferencias y en una devolución: cada renglón, aunque sea 0"),
	}),
	salida: z.object({ recepcion_id: z.uuid().describe("La recepción") }),
	permiso: { departamento: "aduana" },
	errores: [{ codigo: "no_por_recibir", mensaje: "{folio} ya se recibió" }],
	edita: true,
});

/** Aduana saca al proveedor lo de más que Dirección rechazó: los rollos escogidos o la cantidad. */
export const devolverAProveedor = definirAccion({
	nombre: "inventario.devolver_a_proveedor",
	descripcion: "Saca al proveedor lo de más rechazado: de aduana, o lo que Bodega surtió a aduana",
	entrada: z.object({
		traspaso_id: z.uuid().describe("La devolución al proveedor"),
		rollo_ids: z.array(z.uuid()).optional().describe("Si es tela y espera en aduana: los rollos que regresan"),
		cantidad: z
			.string()
			.trim()
			.regex(/^\d{1,9}(\.\d{1,3})?$/)
			.optional()
			.describe("Si no es tela y espera en aduana: lo que regresa"),
	}),
	salida: z.object({}),
	permiso: { departamento: "aduana" },
	errores: [
		{ codigo: "no_esta_en_aduana", mensaje: "{folio} no está en aduana." },
		{ codigo: "rollo_ajeno", mensaje: "{rollo} no es de {material} de {OC}, o no está en aduana." },
		{ codigo: "cantidad_distinta", mensaje: "Lo que regresa es {n} {unidad}." },
	],
	edita: true,
});
