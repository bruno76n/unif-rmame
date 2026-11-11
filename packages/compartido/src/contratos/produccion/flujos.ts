/**
 * Los contratos de los flujos del taller: crear uno, agregarle y quitarle operaciones.
 * Fase 12 · docs/modulos/produccion/operaciones-y-flujos.md («Acciones»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** Una operación de un flujo, como la regresa la acción. */
const operacionDelFlujo = z.object({
	flujo_operacion_id: z.uuid().describe("La operación en el flujo"),
	operacion_id: z.uuid().describe("La operación del catálogo"),
	nombre: z.string().describe("Su nombre"),
	orden: z.number().int().describe("Su lugar en el flujo; 1 es el corte"),
	persona_base_id: z.uuid().describe("Quién la hace de base"),
});

/** Producción crea un flujo: a partir de otro o de «Una sola operación». */
export const crearFlujo = definirAccion({
	nombre: "produccion.crear_flujo",
	descripcion: "Crea un flujo nuevo a partir de otro (con sus tarifas) o de «Una sola operación»",
	entrada: z.object({
		nombre: z
			.string("Escribe el nombre del flujo.")
			.trim()
			.min(1, "Escribe el nombre del flujo.")
			.max(60, "El nombre va en 60 letras.")
			.describe("El nombre del flujo"),
		parte_de: z
			.enum(["flujo", "una_sola_operacion"], "Escoge de cuál parte.")
			.describe("De otro flujo o de «Una sola operación»"),
		flujo_origen_id: z.uuid().optional().describe("El flujo del que parte, si parte de uno"),
		persona_corte_id: z.uuid().optional().describe("«¿Quién corta?», si es de una sola operación"),
		persona_base_id: z.uuid().optional().describe("«¿Quién la hace?», si es de una sola operación"),
	}),
	salida: z.object({
		flujo_id: z.uuid().describe("El flujo"),
		operaciones: z.array(operacionDelFlujo).describe("Sus operaciones, en orden"),
	}),
	permiso: { departamento: "produccion" },
	errores: [
		{ codigo: "flujo_repetido", mensaje: "Ya hay un flujo con ese nombre." },
		{ codigo: "flujo_origen_de_baja", mensaje: "Ese flujo está dado de baja." },
		{ codigo: "persona_no_valida", mensaje: "¿Quién la hace?" },
	],
});

/** Producción agrega una operación a un flujo, antes de la que escoja. */
export const agregarOperacionFlujo = definirAccion({
	nombre: "produccion.agregar_operacion_flujo",
	descripcion: "Agrega una operación a un flujo, antes de otra; nace sin tarifa",
	entrada: z.object({
		flujo_id: z.uuid().describe("El flujo"),
		operacion: z
			.string("Escribe la operación.")
			.trim()
			.min(1, "Escribe la operación.")
			.max(40, "La operación va en 40 letras.")
			.describe("El nombre de la operación; si ya existe en el catálogo, se usa esa"),
		persona_base_id: z.uuid("¿Quién la hace?").describe("Quién la hace de base"),
		va_antes_de_id: z.uuid().describe("La operación del flujo antes de la que va"),
	}),
	salida: z.object({ flujo_operacion_id: z.uuid().describe("La operación nueva en el flujo") }),
	permiso: { departamento: "produccion" },
	errores: [
		{ codigo: "operacion_ya_en_flujo", mensaje: "Ya está en este flujo." },
		{ codigo: "corte_va_primero", mensaje: "El corte siempre va primero" },
		{ codigo: "persona_no_valida", mensaje: "¿Quién la hace?" },
	],
	edita: true,
});

/** Producción quita una operación de un flujo: queda dada de baja. */
export const quitarOperacionFlujo = definirAccion({
	nombre: "produccion.quitar_operacion_flujo",
	descripcion: "Quita una operación de un flujo; los registros viejos siguen apuntando a ella",
	entrada: z.object({ flujo_operacion_id: z.uuid().describe("La operación en el flujo") }),
	salida: z.object({}),
	permiso: { departamento: "produccion" },
	errores: [
		{ codigo: "corte_va_primero", mensaje: "El corte siempre va primero" },
		{ codigo: "flujo_minimo", mensaje: "Un flujo lleva al menos el corte y una operación" },
	],
	edita: true,
});
