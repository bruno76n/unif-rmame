/**
 * Los contratos de los pagos que Contaduría recibe de un cliente: registrarlo a una nota y cancelarlo.
 * Fase 15 · docs/modulos/contaduria/pagos-y-saldo-a-favor.md («Acciones»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/**
 * Un monto en centavos. Va en pesos enteros, salvo el que liquida exacto lo que queda, que puede traer centavos: lo
 * revisa la acción, que conoce el saldo (decisión 674).
 */
export const montoDePago = (mensaje: string) => z.number(mensaje).int(mensaje).positive(mensaje);

/** Dónde se recibió o de dónde sale el dinero: en efectivo o en una cuenta de la fábrica, con su referencia. */
export const medioDePago = {
	medio: z
		.enum(["efectivo", "cuenta_fabrica"], "Escoge cómo pagó.")
		.describe("En efectivo o en una cuenta de la fábrica"),
	cuenta_fabrica_id: z
		.uuid("Escoge la cuenta.")
		.optional()
		.describe("La cuenta de la fábrica, de la lista «Cuentas de la fábrica»; con una sola, la pone el servidor"),
};

/** Contaduría registra un pago que un cliente hizo a una de sus notas entregadas. */
export const registrarPagoRecibido = definirAccion({
	nombre: "contaduria.registrar_pago_recibido",
	descripcion: "Registra un pago recibido de un cliente a una nota entregada y baja su cuenta por cobrar",
	entrada: z.object({
		cliente_id: z.uuid("Escoge el cliente.").describe("El cliente que pagó"),
		nota_entrega_id: z.uuid("Escoge la nota.").describe("La nota entregada que paga"),
		monto_centavos: montoDePago("Escribe el monto en pesos").describe(
			"El monto en centavos: en pesos enteros, o con centavos si liquida exacto el saldo de la nota",
		),
		...medioDePago,
		referencia: z
			.string("Escribe la referencia del depósito")
			.trim()
			.min(3, "Escribe la referencia del depósito")
			.max(30, "Va en 30 letras.")
			.optional()
			.describe("SPEI, folio, ficha o recibo: si no es en efectivo"),
	}),
	salida: z.object({
		pago_id: z.uuid(),
		folio: z.string().describe("El PG-"),
		saldo_centavos: z.number().int().optional().describe("El saldo de la nota después del pago"),
	}),
	permiso: { departamento: "contaduria" },
	errores: [
		{ codigo: "nota_sin_entregar", mensaje: "{NV} todavía no se entrega: se cobra al confirmar la entrega." },
		{ codigo: "documento_de_otro_cliente", mensaje: "{folio} no es de {cliente}." },
		{ codigo: "monto_mayor_que_saldo", mensaje: "El saldo de {folio} es {saldo}." },
	],
});

/** Contaduría cancela un pago registrado: sus aplicaciones se cancelan y los saldos regresan. */
export const cancelarPago = definirAccion({
	nombre: "contaduria.cancelar_pago",
	descripcion: "Cancela un pago: regresa los saldos y los estados que movió",
	entrada: z.object({
		pago_id: z.uuid().describe("El pago"),
		motivo: z.string("Escribe el motivo").trim().min(1, "Escribe el motivo").max(200).describe("Por qué se cancela"),
	}),
	salida: z.object({ pago_id: z.uuid() }),
	permiso: { departamento: "contaduria", confirmarConGoogle: "cancelar_pago" },
	errores: [
		{ codigo: "pago_cancelado", mensaje: "{PG} ya está cancelado." },
		{
			codigo: "anticipo_ya_aplicado",
			mensaje: "El anticipo de {PG} ya se aplicó a una nota: ya no se puede cancelar.",
		},
		{ codigo: "saldo_a_favor_ya_usado", mensaje: "Lo que dejó {PG} a favor ya se usó: ya no se puede cancelar." },
	],
	edita: true,
});
