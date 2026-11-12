/**
 * Los contratos del saldo a favor de un cliente: aplicarlo a una nota y devolvérselo.
 * Fase 15 · docs/modulos/contaduria/pagos-y-saldo-a-favor.md (reglas 6 a 8, «Acciones»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";
import { medioDePago, montoDePago } from "./pagos.ts";

/** Contaduría aplica saldo a favor de un cliente a una de sus notas entregadas. */
export const aplicarSaldoAFavor = definirAccion({
	nombre: "contaduria.aplicar_saldo_a_favor",
	descripcion: "Aplica saldo a favor de un cliente a una nota entregada y baja su cuenta por cobrar",
	entrada: z.object({
		cliente_id: z.uuid("Escoge el cliente.").describe("El cliente"),
		nota_entrega_id: z.uuid("Escoge la nota.").describe("La nota entregada"),
		monto_centavos: z
			.number("Escribe el monto.")
			.int("Escribe el monto.")
			.positive("Escribe el monto.")
			.describe("Lo que se aplica, en centavos"),
	}),
	salida: z.object({ saldo_favor_movimiento_id: z.uuid() }),
	permiso: { departamento: "contaduria" },
	errores: [
		{ codigo: "sin_saldo_a_favor", mensaje: "{cliente} no tiene saldo a favor." },
		{ codigo: "monto_mayor_que_saldo_a_favor", mensaje: "Hasta {saldo a favor}." },
		{ codigo: "nota_sin_entregar", mensaje: "{NV} todavía no se entrega: se cobra al confirmar la entrega." },
		{ codigo: "documento_de_otro_cliente", mensaje: "{folio} no es de {cliente}." },
		{ codigo: "monto_mayor_que_saldo", mensaje: "El saldo de {folio} es {saldo}." },
	],
});

/** Contaduría le devuelve a un cliente su saldo a favor: un pago emitido. */
export const devolverSaldoAFavor = definirAccion({
	nombre: "contaduria.devolver_saldo_a_favor",
	descripcion: "Devuelve saldo a favor a un cliente con un pago emitido",
	entrada: z.object({
		cliente_id: z.uuid("Escoge el cliente.").describe("El cliente"),
		monto_centavos: montoDePago("Escribe el monto en pesos").describe(
			"Lo que se devuelve: en pesos enteros, o con centavos si es todo el saldo a favor",
		),
		...medioDePago,
		referencia: z
			.string("Escribe la referencia")
			.trim()
			.min(3, "Escribe la referencia")
			.max(30, "Va en 30 letras.")
			.describe("SPEI, folio, ficha o recibo"),
	}),
	salida: z.object({ pago_id: z.uuid(), folio: z.string().describe("El PG-") }),
	permiso: { departamento: "contaduria", confirmarConGoogle: "devolver_saldo_a_favor" },
	errores: [{ codigo: "sin_saldo_a_favor", mensaje: "{cliente} no tiene saldo a favor." }],
});
