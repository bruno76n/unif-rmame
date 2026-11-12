/**
 * Los contratos de los pedidos de un cliente externo: guardar el borrador, confirmarlo, guardar una versión y
 * cancelarlo.
 * Fase 16 · docs/modulos/ventas/pedidos.md («Acciones»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** Cómo paga el cliente un pedido. */
export const formasDePago = ["contado", "anticipo", "credito"] as const;

/** Un renglón por talla: la variante, las piezas y el precio que dio Ventas, si lo dio. */
const renglon = z.object({
	variante_id: z.uuid("Pon las piezas por talla").describe("La prenda y la talla"),
	cantidad: z
		.number("Pon las piezas por talla")
		.int("Número entero")
		.min(0, "Pon las piezas por talla")
		.describe("De 0 a `ventas.piezas_max_talla`"),
	precio_dado_centavos: z
		.number("Escribe el precio en pesos")
		.int("Escribe el precio en pesos")
		.positive("Escribe el precio en pesos")
		.multipleOf(100, "Escribe el precio en pesos")
		.optional()
		.describe("El precio que da Ventas; sin él, el sugerido de Catálogo"),
});

/** El pedido como lo mandan las tres primeras acciones. */
const elPedido = {
	cliente_id: z.uuid("Escoge el cliente.").describe("El cliente; no cambia en un pedido que ya existe"),
	fecha_entrega: z.iso.date("Pon la fecha de entrega.").describe("No antes de hoy"),
	forma_pago: z.enum(formasDePago, "Escoge la forma de pago.").describe("Contado, anticipo o crédito"),
	renglones: z
		.array(renglon, "Agrega al menos una prenda con piezas.")
		.min(1, "Agrega al menos una prenda con piezas.")
		.describe("Uno por talla"),
};

/** Los errores que comparten guardar, confirmar y guardar una versión. */
const erroresDelPedido = [
	{ codigo: "entrega_pasada", mensaje: "La entrega no puede ser antes de hoy." },
	{ codigo: "cliente_detenido", mensaje: "{cliente} está detenido por crédito." },
	{ codigo: "cliente_dado_de_baja", mensaje: "{cliente} está dado de baja." },
	{ codigo: "cliente_no_cambia", mensaje: "El cliente no cambia en un pedido que ya existe." },
	{ codigo: "sin_credito", mensaje: "Sin crédito: de contado o con anticipo hasta que Contaduría le ponga límite." },
	{ codigo: "sin_precio", mensaje: "{prenda}: sin precio para este cliente en Catálogo." },
	{
		codigo: "no_se_vende_a_externos",
		mensaje: "{prenda} no se vende a clientes externos. Catálogo lo prende en su ficha.",
	},
	{ codigo: "producto_descontinuado", mensaje: "{prenda} está descontinuado: Catálogo lo puede reactivar." },
	{ codigo: "talla_dada_de_baja", mensaje: "{prenda} talla {t} está dada de baja." },
] as const;

/** Lo que regresan guardar y confirmar. */
const pedidoGuardado = z.object({
	pedido_id: z.uuid(),
	folio: z.string().describe("El PE-"),
	total_centavos: z.number().int().optional().describe("El total del pedido vigente"),
});

/** Ventas guarda un pedido como borrador: nuevo o el mismo borrador, con el precio de hoy. */
export const guardarBorradorPedido = definirAccion({
	nombre: "ventas.guardar_borrador_pedido",
	descripcion: "Guarda un pedido como borrador, con el precio de hoy sin congelar",
	entrada: z.object({
		pedido_id: z.uuid().optional().describe("El borrador que se guarda; sin él, uno nuevo"),
		...elPedido,
	}),
	salida: pedidoGuardado,
	permiso: { departamento: "ventas" },
	errores: [...erroresDelPedido, { codigo: "pedido_no_es_borrador", mensaje: "{PE} ya está {estado}." }],
	edita: true,
	versionOpcional: true,
});

/** Ventas confirma un pedido: el borrador como está, o uno nuevo. El precio queda congelado y nace la versión 1. */
export const confirmarPedido = definirAccion({
	nombre: "ventas.confirmar_pedido",
	descripcion: "Confirma un pedido: congela su precio y nace su versión 1",
	entrada: z.object({
		pedido_id: z.uuid().optional().describe("El borrador que se confirma como está; sin él, el pedido que llega"),
		cliente_id: elPedido.cliente_id.optional(),
		fecha_entrega: elPedido.fecha_entrega.optional(),
		forma_pago: elPedido.forma_pago.optional(),
		renglones: elPedido.renglones.optional(),
	}),
	salida: pedidoGuardado.extend({ por_mandar: z.number().int().describe("Las piezas por mandar a producción") }),
	permiso: { departamento: "ventas" },
	errores: [...erroresDelPedido, { codigo: "pedido_no_es_borrador", mensaje: "{PE} ya está {estado}." }],
	edita: true,
	versionOpcional: true,
});

/** Ventas guarda la versión siguiente de un pedido confirmado: los renglones son lo que debe quedar. */
export const guardarVersionPedido = definirAccion({
	nombre: "ventas.guardar_version_pedido",
	descripcion: "Guarda la versión siguiente de un pedido confirmado, sin cambiar un renglón confirmado",
	entrada: z.object({ pedido_id: z.uuid().describe("El pedido confirmado"), ...elPedido }),
	salida: z.object({
		pedido_id: z.uuid(),
		numero: z.number().int().describe("El número de la versión"),
		por_mandar: z.number().int(),
		de_mas: z.number().int().describe("Las piezas de más en producción"),
	}),
	permiso: { departamento: "ventas" },
	errores: [
		...erroresDelPedido,
		{ codigo: "sin_cambios", mensaje: "Sin cambios" },
		{ codigo: "talla_bajo_minimo", mensaje: "{prenda} talla {t}: mínimo {n}." },
		{ codigo: "prenda_no_se_quita", mensaje: "{prenda} ya tiene piezas entregadas o en aduana: no se puede quitar." },
		{
			codigo: "pedido_no_confirmado",
			mensaje: "{PE} está {estado}: solo un pedido confirmado guarda versiones.",
		},
	],
	edita: true,
});

/** Ventas cancela un pedido sin notas de entrega. */
export const cancelarPedido = definirAccion({
	nombre: "ventas.cancelar_pedido",
	descripcion: "Cancela un pedido: sus lotes pasan a temporada, sus reservas se liberan y su anticipo pasa a favor",
	entrada: z.object({
		pedido_id: z.uuid().describe("El pedido"),
		motivo: z.string("Escribe el motivo").trim().min(1, "Escribe el motivo").max(200).describe("Por qué"),
	}),
	salida: z.object({ pedido_id: z.uuid() }),
	permiso: { departamento: "ventas" },
	errores: [
		{ codigo: "pedido_con_notas", mensaje: "{PE} ya tiene notas de entrega: no se puede cancelar." },
		{ codigo: "pedido_terminado", mensaje: "{PE} ya está {estado}." },
	],
	edita: true,
});
