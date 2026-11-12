/**
 * Los contratos de las notas de entrega: armarla con lo listo de un pedido, cancelarla antes de que salga, confirmar
 * la entrega con quién recibió y pasar a bodega lo listo que el cliente ya no quiere.
 * Fase 16 · docs/modulos/ventas/notas-de-entrega.md («Acciones»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** Las piezas de una talla. */
const piezas = z.number("Número entero").int("Número entero").positive("Escoge al menos una pieza.");

/** El pedido no está confirmado. */
const pedidoNoConfirmado = {
	codigo: "pedido_no_confirmado",
	mensaje: "{PE} está {estado}: solo un pedido confirmado lleva notas de entrega.",
} as const;

/** Ventas arma la nota de entrega NV- con lo listo en aduana de un pedido, al precio del pedido. */
export const armarNotaEntrega = definirAccion({
	nombre: "ventas.armar_nota_entrega",
	descripcion: "Arma una nota de entrega con lo listo en aduana de un pedido, al precio del pedido y con su anticipo",
	entrada: z.object({
		pedido_id: z.uuid().describe("El pedido confirmado"),
		renglones: z
			.array(z.object({ variante_id: z.uuid().describe("La prenda y la talla"), cantidad: piezas.describe("Cuántas") }))
			.min(1, "Escoge al menos una pieza.")
			.describe("Lo que lleva la nota, por talla"),
	}),
	salida: z.object({
		nota_id: z.uuid(),
		folio: z.string(),
		subtotal_centavos: z.number().int().optional().describe("Lo de sus renglones"),
		anticipo_centavos: z.number().int().optional().describe("Lo que descontó el anticipo"),
		por_cobrar_centavos: z.number().int().optional().describe("El subtotal menos el anticipo"),
	}),
	permiso: { departamento: "ventas" },
	errores: [
		pedidoNoConfirmado,
		{ codigo: "nada_listo", mensaje: "Nada listo en aduana para este pedido" },
		{ codigo: "sin_listo", mensaje: "Solo hay {n} listas de {prenda} talla {t}" },
		{ codigo: "talla_fuera_del_pedido", mensaje: "{prenda} talla {t} ya no está en {PE}: pásala a bodega." },
	],
	edita: true,
});

/** Ventas cancela una nota antes de que salga de aduana: sus piezas y su anticipo regresan al pedido. */
export const cancelarNotaEntrega = definirAccion({
	nombre: "ventas.cancelar_nota_entrega",
	descripcion: "Cancela una nota de entrega que no ha salido de aduana: sus piezas y su anticipo regresan al pedido",
	entrada: z.object({
		nota_id: z.uuid().describe("La nota por despachar"),
		motivo: z.string("Escribe el motivo").trim().min(1, "Escribe el motivo").max(200).describe("Por qué"),
	}),
	salida: z.object({ nota_id: z.uuid() }),
	permiso: { departamento: "ventas" },
	errores: [{ codigo: "nota_ya_salio", mensaje: "{NV} ya salió de aduana: no se puede cancelar." }],
	edita: true,
});

/** Ventas o Aduana confirman que el cliente firmó de recibido: las piezas salen y nace su cuenta por cobrar. */
export const confirmarEntrega = definirAccion({
	nombre: "ventas.confirmar_entrega",
	descripcion: "Confirma la entrega de una nota en camino con quién recibió: sale del inventario y Contaduría la cobra",
	entrada: z.object({
		nota_id: z.uuid().describe("La nota en camino"),
		recibio_nombre: z
			.string("Escribe quién recibió")
			.trim()
			.min(1, "Escribe quién recibió")
			.max(60)
			.describe("Quién firmó de recibido"),
	}),
	salida: z.object({
		nota_id: z.uuid(),
		pedido_entregado: z.boolean().describe("Si el pedido ya quedó entregado"),
		por_cobrar_centavos: z.number().int().optional().describe("Solo a quien ve precios"),
	}),
	permiso: { departamento: ["ventas", "aduana"] },
	errores: [
		{ codigo: "nota_no_en_camino", mensaje: "{NV} no ha salido de aduana: primero se despacha." },
		{ codigo: "nota_ya_entregada", mensaje: "{NV} ya está entregada." },
		{ codigo: "despacho_no_en_transito", mensaje: "{D} no está en tránsito." },
	],
	edita: true,
});

/** Ventas pasa a bodega lo listo que el cliente ya no quiere: baja esas piezas del pedido en una versión nueva. */
export const pasarABodega = definirAccion({
	nombre: "ventas.pasar_a_bodega",
	descripcion: "Pasa a bodega lo listo en aduana que el cliente ya no quiere y lo baja del pedido en una versión nueva",
	entrada: z.object({
		pedido_id: z.uuid().describe("El pedido confirmado"),
		renglones: z
			.array(z.object({ variante_id: z.uuid().describe("La prenda y la talla"), piezas: piezas.describe("Cuántas") }))
			.min(1, "Escoge al menos una pieza.")
			.describe("Lo que regresa a bodega, por talla"),
		motivo: z.string("Escribe el motivo").trim().min(1, "Escribe el motivo").max(200).describe("Por qué"),
	}),
	salida: z.object({ pedido_id: z.uuid(), numero: z.number().int().describe("La versión nueva del pedido") }),
	permiso: { departamento: "ventas" },
	errores: [
		pedidoNoConfirmado,
		{ codigo: "piezas_de_mas", mensaje: "{prenda} talla {t}: hay {n} listas en aduana sin nota." },
	],
	edita: true,
});

/** Ventas pide a Dirección una nota de crédito para una nota entregada, con qué pasó, de cuánto y qué regresa. */
export const pedirNotaCredito = definirAccion({
	nombre: "ventas.pedir_nota_credito",
	descripcion: "Pide a Dirección una nota de crédito para una nota de entrega entregada",
	entrada: z.object({
		nota_id: z.uuid().describe("La nota entregada"),
		que_paso: z.string("Escribe qué pasó.").trim().min(1, "Escribe qué pasó.").max(500).describe("Qué pasó"),
		monto_centavos: z
			.number("Escribe de cuánto es la nota de crédito.")
			.int("Escribe de cuánto es la nota de crédito.")
			.positive("Escribe de cuánto es la nota de crédito.")
			.describe("De cuánto, en centavos"),
		piezas: z
			.array(
				z.object({
					nota_entrega_linea_id: z.uuid().describe("El renglón de la nota"),
					cantidad: piezas.describe("Cuántas regresan"),
				}),
			)
			.optional()
			.describe("Las piezas que regresan, si regresan"),
	}),
	salida: z.object({ nota_credito_id: z.uuid() }),
	permiso: { departamento: "ventas" },
	errores: [
		{ codigo: "nota_no_entregada", mensaje: "Solo una nota entregada lleva nota de crédito." },
		{ codigo: "nota_credito_esperando", mensaje: "{NV} ya tiene una nota de crédito esperando autorización." },
		{ codigo: "monto_de_mas", mensaje: "La nota de crédito no puede pasar de ${tope}: es lo que queda de {NV}." },
		{ codigo: "piezas_de_mas", mensaje: "{prenda} talla {t}: solo pueden regresar {n}." },
	],
	edita: false,
});
