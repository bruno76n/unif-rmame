/**
 * Los contratos de las tarifas por operación.
 * Fase 7 · docs/modulos/personal/tarifas.md («Acciones»)
 *
 * La tarifa es sueldo: solo Personal con «ven sueldos y tarifas».
 * Fase 19 · la consulta de Personal · Tarifas, que deja su consulta en la bitácora (docs/interfaz/fabrica/personal.md)
 */

import { z } from "zod";
import { definirAccion, definirConsulta } from "../definir.ts";

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
	errores: [{ codigo: "operacion_de_baja", mensaje: "Esa operación ya no está en el flujo" }],
});

/** Una tarifa por pieza, en centavos: el servidor la recorta a quien no tiene «ven sueldos y tarifas». */
const tarifa = z.number().int().optional().describe("Pesos por pieza, en centavos");

/** Personal · Tarifas: una tarjeta por flujo con sus operaciones y su tarifa vigente; con el historial, las anteriores. */
export const tarifasDelPersonal = definirConsulta({
	nombre: "personal.tarifas",
	descripcion:
		"Personal · Tarifas: cada flujo con sus operaciones y su tarifa por pieza; pide «ven sueldos y tarifas» y queda en la bitácora",
	entrada: z.object({
		flujo_id: z.uuid().optional().describe("Un solo flujo; sin él, todos"),
		historial: z.enum(["si", "no"]).optional().describe("«si» suma las tarifas anteriores con sus fechas"),
	}),
	salida: z.object({
		sin_tarifa: z.number().int().describe("Las operaciones vigentes sin tarifa: sus piezas no suman a la nómina"),
		flujos: z.array(
			z.object({
				flujo_id: z.uuid(),
				nombre: z.string(),
				operaciones: z.array(
					z.object({
						flujo_operacion_id: z.uuid(),
						nombre: z.string(),
						la_hace: z.string().describe("Quién la hace de base"),
						tarifa_centavos: tarifa.nullable().describe("La vigente; vacía si está «Sin tarifa»"),
						desde: z.string().nullable().describe("Desde cuándo vale la vigente"),
						version: z.number().int().nullable().describe("La versión de la vigente, para cambiarla"),
						anteriores: z
							.array(z.object({ tarifa_centavos: tarifa, desde: z.string(), hasta: z.string() }))
							.describe("Con el historial: las que ya no valen, de la más reciente a la más vieja"),
					}),
				),
			}),
		),
	}),
	permiso: { departamento: "personal", permisoFino: "ven_sueldos_y_tarifas" },
	recortables: ["tarifa_centavos"],
});
