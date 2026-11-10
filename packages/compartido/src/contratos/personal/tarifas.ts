/**
 * Los contratos de las tarifas por operación.
 * Fase 7 · docs/modulos/personal/tarifas.md («Acciones»)
 *
 * La tarifa es sueldo: solo Personal con «ven sueldos y tarifas».
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** Personal pone la tarifa de una operación del flujo: cierra la vigente y abre la nueva. */
export const ponerTarifaOperacion = definirAccion({
	nombre: "personal.poner_tarifa_operacion",
	descripcion: "Pone la tarifa por pieza de una operación del flujo; vale desde ahora",
	entrada: z.object({
		flujo_operacion_id: z.uuid().describe("La operación dentro de su flujo"),
		tarifa_centavos: z
			.number("Escribe la tarifa en pesos, por ejemplo 1.50")
			.int("Escribe la tarifa en pesos, por ejemplo 1.50")
			.positive("Escribe la tarifa en pesos, por ejemplo 1.50")
			.max(99_999_999, "Escribe la tarifa en pesos, por ejemplo 1.50")
			.describe("Pesos por pieza, en centavos"),
		version: z.number().int().nonnegative().optional().describe("La versión de la tarifa vigente, si tenía"),
	}),
	salida: z.object({
		tarifa_operacion_id: z.uuid().describe("La tarifa vigente"),
		version: z.number().int().describe("Su versión"),
	}),
	permiso: { departamento: "personal", permisoFino: "ven_sueldos_y_tarifas" },
	errores: [],
});
