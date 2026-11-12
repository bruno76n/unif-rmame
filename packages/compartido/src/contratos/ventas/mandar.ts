/**
 * Los contratos de la revisión antes de fabricar: mandar a producción lo que falta de un pedido y surtir de bodega lo
 * que hay libre.
 * Fase 16 · docs/modulos/ventas/mandar-a-produccion.md («Acciones»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** Las tallas y las piezas; si no vienen, todo lo que se puede. */
const renglones = z
	.array(
		z.object({
			variante_id: z.uuid().describe("La prenda y la talla"),
			piezas: z.number("Pon las piezas").int("Número entero").positive("Pon las piezas").describe("Cuántas"),
		}),
	)
	.min(1)
	.optional()
	.describe("Por talla; si no vienen, todo lo que falta por mandar");

/** El pedido no está confirmado. */
const pedidoNoConfirmado = {
	codigo: "pedido_no_confirmado",
	mensaje: "{PE} está {estado}: solo un pedido confirmado se manda a producción.",
} as const;

/** Más piezas de las que faltan por mandar. */
const deMasPorMandar = {
	codigo: "piezas_de_mas_por_mandar",
	mensaje: "{prenda} talla {t}: solo faltan {n} por mandar.",
} as const;

/** Ventas manda a producción lo que falta de un pedido: se suma a sus lotes por cortar o nace su orden. */
export const mandarAProduccion = definirAccion({
	nombre: "ventas.mandar_a_produccion",
	descripcion: "Manda a producción lo que falta por mandar de un pedido confirmado",
	entrada: z.object({ pedido_id: z.uuid().describe("El pedido confirmado"), renglones }),
	salida: z.object({
		piezas: z.number().int(),
		orden_produccion_id: z.uuid().optional().describe("La orden nueva, si nació"),
		lotes: z.array(z.object({ lote_id: z.uuid(), folio: z.string(), nuevo: z.boolean(), piezas: z.number().int() })),
	}),
	permiso: { departamento: "ventas" },
	errores: [
		{ codigo: "nada_por_mandar", mensaje: "Todo el pedido ya está en producción." },
		pedidoNoConfirmado,
		deMasPorMandar,
		{ codigo: "talla_descontinuada", mensaje: "{prenda} talla {t} está descontinuada: ya no se fabrica." },
	],
	edita: true,
});

/** Ventas aparta en Bodega, para el pedido, lo que hay libre de una prenda. */
export const surtirDeBodega = definirAccion({
	nombre: "ventas.surtir_de_bodega",
	descripcion: "Aparta en Bodega para un pedido lo libre de una prenda, hasta lo que falta por mandar",
	entrada: z.object({
		pedido_id: z.uuid().describe("El pedido confirmado"),
		producto_id: z.uuid().describe("La prenda"),
		renglones,
	}),
	salida: z.object({ piezas: z.number().int(), por_mandar: z.number().int().describe("Lo que queda por mandar") }),
	permiso: { departamento: "ventas" },
	errores: [
		{ codigo: "bodega_sin_libres", mensaje: "Bodega ya no tiene libres de {prenda} talla {t}: quedan {n}." },
		deMasPorMandar,
		pedidoNoConfirmado,
	],
	edita: true,
});
