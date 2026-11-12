/**
 * Los contratos del crédito de clientes: Contaduría cambia el límite, los días y el semáforo de un cliente.
 * Fase 15 · docs/modulos/contaduria/credito-de-clientes.md («Acciones»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** El semáforo de crédito de un cliente. */
export const semaforoDeCredito = z.enum(["al_corriente", "cerca_del_limite", "detenido"]);

/** El cliente cuyo crédito se cambia. */
const cliente = z.uuid("Escoge el cliente.").describe("El cliente");

/** Contaduría le pone a un cliente su límite de crédito; 0 lo deja sin crédito. */
export const cambiarLimiteCredito = definirAccion({
	nombre: "contaduria.cambiar_limite_credito",
	descripcion: "Cambia el límite de crédito de un cliente; el semáforo no cambia solo",
	entrada: z.object({
		cliente_id: cliente,
		limite_centavos: z
			.number("Escribe el límite en pesos, sin centavos.")
			.int("Escribe el límite en pesos, sin centavos.")
			.min(0, "Escribe el límite en pesos, sin centavos.")
			.multipleOf(100, "Escribe el límite en pesos, sin centavos.")
			.describe("El límite en centavos, en pesos enteros; 0 es sin crédito"),
	}),
	salida: z.object({
		credito_cliente_id: z.uuid(),
		semaforo_sugerido: semaforoDeCredito.describe("El semáforo que sugiere el sistema con el límite nuevo"),
	}),
	permiso: { departamento: "contaduria" },
	errores: [{ codigo: "cliente_dado_de_baja", mensaje: "{cliente} está dado de baja." }],
	edita: true,
});

/** Contaduría cambia los días de crédito de un cliente; los pedidos ya guardados conservan los suyos. */
export const cambiarDiasCredito = definirAccion({
	nombre: "contaduria.cambiar_dias_credito",
	descripcion: "Cambia los días de crédito de un cliente; los pedidos ya guardados no cambian",
	entrada: z.object({
		cliente_id: cliente,
		dias_credito: z
			.number("Escribe los días de crédito.")
			.int("Escribe los días de crédito.")
			.positive("Escribe los días de crédito.")
			.describe("Los días que se suman a la fecha de entrega"),
	}),
	salida: z.object({ credito_cliente_id: z.uuid() }),
	permiso: { departamento: "contaduria" },
	errores: [{ codigo: "cliente_dado_de_baja", mensaje: "{cliente} está dado de baja." }],
	edita: true,
});

/** Contaduría pone a mano el semáforo de crédito de un cliente. */
export const cambiarSemaforoCredito = definirAccion({
	nombre: "contaduria.cambiar_semaforo_credito",
	descripcion: "Pone el semáforo de crédito de un cliente",
	entrada: z.object({
		cliente_id: cliente,
		semaforo: semaforoDeCredito.describe("Al corriente, cerca del límite o detenido"),
	}),
	salida: z.object({ credito_cliente_id: z.uuid() }),
	permiso: { departamento: "contaduria" },
	errores: [{ codigo: "cliente_dado_de_baja", mensaje: "{cliente} está dado de baja." }],
	edita: true,
});
