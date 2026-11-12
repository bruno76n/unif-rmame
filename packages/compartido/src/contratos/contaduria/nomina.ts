/**
 * Los contratos de la nómina: el descuento semanal de una persona y pagar la nómina de una semana.
 * Fase 17 · docs/modulos/contaduria/nomina.md («Acciones»)
 *
 * Las dos piden «ven sueldos y tarifas»; pagar pide además «Confirmar con Google».
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** Contaduría pone, cambia o quita el descuento semanal de una persona. */
export const guardarDescuentoSemanal = definirAccion({
	nombre: "contaduria.guardar_descuento_semanal",
	descripcion: "Pone, cambia o quita (con 0) el descuento semanal de una persona",
	entrada: z.object({
		persona_id: z.uuid("Escoge a la persona.").describe("La persona"),
		monto_semanal_centavos: z
			.number("Escribe el descuento en pesos; 0 lo quita.")
			.int("Escribe el descuento en pesos; 0 lo quita.")
			.nonnegative("Escribe el descuento en pesos; 0 lo quita.")
			.multipleOf(100, "Escribe el descuento en pesos; 0 lo quita.")
			.describe("Lo que se descuenta cada semana, en pesos enteros; 0 lo quita"),
		motivo: z
			.string("Escribe por qué se le descuenta.")
			.trim()
			.max(200)
			.optional()
			.describe("Por qué: un préstamo, un adelanto de sueldo"),
	}),
	salida: z.object({ descuento_nomina_id: z.uuid().optional().describe("El descuento vigente, si quedó uno") }),
	permiso: { departamento: "contaduria", permisoFino: "ven_sueldos_y_tarifas" },
	errores: [
		{ codigo: "persona_de_baja", mensaje: "{persona} está dada de baja." },
		{ codigo: "sin_descuento", mensaje: "{persona} no tiene descuento semanal." },
	],
	edita: true,
	versionOpcional: true,
});

/** Contaduría paga la nómina de una semana, con el total que vio la pantalla, una sola vez. */
export const pagarNomina = definirAccion({
	nombre: "contaduria.pagar_nomina",
	descripcion: "Paga la nómina de una semana con el total que vio la pantalla; queda congelada",
	entrada: z.object({
		nomina_id: z.uuid().describe("La nómina"),
		total_visto_centavos: z.number().int().nonnegative().describe("El total que mostró la pantalla"),
		renglones: z
			.array(
				z.object({
					persona_id: z.uuid().describe("La persona"),
					medio_pago: z.enum(["efectivo", "transferencia"]).describe("Cómo se le pagó"),
					referencia_pago: z
						.string("La referencia lleva de 3 a 30 letras")
						.trim()
						.min(3, "La referencia lleva de 3 a 30 letras")
						.max(30, "La referencia lleva de 3 a 30 letras")
						.optional()
						.describe("Su referencia, si la hay"),
				}),
			)
			.optional()
			.describe("Por persona, cómo se le pagó"),
	}),
	salida: z.object({ nomina_id: z.uuid() }),
	permiso: { departamento: "contaduria", permisoFino: "ven_sueldos_y_tarifas", confirmarConGoogle: "pagar_nomina" },
	errores: [
		{
			codigo: "asistencia_sin_cerrar",
			mensaje: "Asistencia sin cerrar: Personal tiene que cerrar la semana del {semana}",
		},
		{ codigo: "nomina_pagada", mensaje: "La nómina del {semana} ya está pagada" },
		{ codigo: "semana_anterior_sin_pagar", mensaje: "Primero paga la nómina del {semana anterior}" },
		{ codigo: "persona_fuera_de_nomina", mensaje: "{persona} no está en esta nómina." },
		{
			codigo: "nomina_cambio",
			mensaje: "La nómina cambió desde que la abriste: ahora suma {total}. Revísala y vuelve a pagar",
		},
	],
	edita: true,
});
