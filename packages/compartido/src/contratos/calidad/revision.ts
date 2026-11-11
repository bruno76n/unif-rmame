/**
 * Los contratos de la revisión de lotes: revisar un lote terminado, aprobar un reproceso y agregar un defecto al
 * catálogo.
 * Fase 13 · docs/modulos/calidad/revision-de-lotes.md («Acciones»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** Calidad revisa un lote terminado: aprueba por talla y regresa a reproceso lo que tiene defecto. */
export const revisarLote = definirAccion({
	nombre: "calidad.revisar_lote",
	descripcion: "Revisa un lote terminado: congela sus aprobadas por talla y regresa cada rechazo como un reproceso",
	entrada: z.object({
		lote_id: z.uuid().describe("El lote terminado"),
		rechazos: z
			.array(
				z.object({
					defecto_id: z.uuid().describe("El defecto"),
					flujo_operacion_id: z.uuid().describe("La operación del flujo del lote que lo causó"),
					persona_id: z.uuid().describe("La persona que lo causó"),
					variante_id: z.uuid().describe("La talla del lote"),
					piezas: z.number("Número entero").int("Número entero").min(1, "Al menos una pieza").describe("Cuántas"),
				}),
			)
			.optional()
			.describe("Los rechazos; sin ellos, se aprueba todo"),
	}),
	salida: z.object({
		revision_id: z.uuid().describe("La revisión"),
		piezas_aprobadas: z.number().int().describe("Las aprobadas, que pasan a aduana"),
		reprocesos: z
			.array(z.object({ reproceso_id: z.uuid(), folio: z.string(), piezas: z.number().int() }))
			.describe("Los reprocesos que nacieron, uno por rechazo"),
	}),
	permiso: { departamento: "calidad" },
	errores: [
		{ codigo: "renglon_repetido", mensaje: "Ese defecto ya está en esa operación y esa talla." },
		{ codigo: "talla_ajena", mensaje: "Esa talla no es del lote." },
		{ codigo: "lote_no_terminado", mensaje: "{lote} no está terminado: todavía no se revisa." },
		{ codigo: "operacion_fuera_del_flujo", mensaje: "Esa operación no es del flujo de {prenda}." },
		{ codigo: "defecto_de_baja", mensaje: "Ese defecto ya no está en el catálogo." },
		{ codigo: "rechazos_mas_que_listas", mensaje: "En la talla {t} hay {n} piezas listas: no se pueden rechazar más." },
	],
	edita: true,
});

/** Calidad aprueba un reproceso completo, con su lote ya en aduana. */
export const aprobarReproceso = definirAccion({
	nombre: "calidad.aprobar_reproceso",
	descripcion: "Aprueba un reproceso completo: sus piezas pasan a aduana, que las cuenta a ciegas",
	entrada: z.object({ reproceso_id: z.uuid().describe("El reproceso") }),
	salida: z.object({ piezas: z.number().int().describe("Las piezas aprobadas") }),
	permiso: { departamento: "calidad" },
	errores: [
		{ codigo: "reproceso_ya_listo", mensaje: "Ese reproceso ya está aprobado." },
		{ codigo: "lote_no_recibido", mensaje: "Aduana todavía no recibe {lote}: el reproceso se aprueba después." },
	],
	edita: true,
});

/** Calidad agrega un defecto al catálogo, con las operaciones que suelen causarlo. */
export const agregarDefecto = definirAccion({
	nombre: "calidad.agregar_defecto",
	descripcion: "Agrega un defecto al catálogo con las operaciones que suelen causarlo",
	entrada: z.object({
		nombre: z
			.string("Escribe el defecto.")
			.trim()
			.min(4, "Escribe el defecto.")
			.max(60, "El defecto va en 60 letras.")
			.describe("El nombre del defecto"),
		operacion_ids: z
			.array(z.uuid(), "Marca al menos una operación.")
			.min(1, "Marca al menos una operación.")
			.describe("Las operaciones que suelen causarlo"),
	}),
	salida: z.object({ defecto_id: z.uuid().describe("El defecto") }),
	permiso: { departamento: "calidad" },
	errores: [
		{ codigo: "defecto_repetido", mensaje: "Ese defecto ya está en el catálogo." },
		{ codigo: "operacion_de_baja", mensaje: "Esa operación ya no está en el catálogo." },
	],
});
