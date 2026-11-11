/**
 * Los contratos de las entregas a corte: Bodega entrega la tela y los avíos de un lote al Taller, y recibe lo que
 * regresa del corte.
 * Fase 12 · docs/modulos/inventario/entregas-a-corte.md («Acciones»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** Bodega entrega al corte los rollos de las telas de la receta de un lote y, la primera vez, sus avíos. */
export const entregarAlCorte = definirAccion({
	nombre: "inventario.entregar_al_corte",
	descripcion: "Entrega al Taller los rollos de un lote por cortar y, la primera vez, sus avíos",
	entrada: z.object({
		lote_id: z.uuid().describe("El lote por cortar"),
		receta_version_id: z.uuid().describe("La versión de la receta con que la pantalla calculó"),
		rollo_ids: z
			.array(z.uuid(), "Marca al menos un rollo")
			.min(1, "Marca al menos un rollo")
			.describe("Los rollos que se entregan, de las telas de la receta"),
		recibio_persona_id: z.uuid().optional().describe("El cortador que recibió, si se guarda"),
	}),
	salida: z.object({ entrega_corte_id: z.uuid().describe("La entrega") }),
	permiso: { departamento: "bodega" },
	errores: [
		{ codigo: "lote_no_por_cortar", mensaje: "{lote} ya se cortó" },
		{ codigo: "sin_receta", mensaje: "{prenda} no tiene receta: no se corta hasta que Patronaje la capture" },
		{ codigo: "receta_cambio", mensaje: "La receta de {prenda} cambió: vuelve a abrir la entrega" },
		{ codigo: "rollo_no_disponible", mensaje: "{rollo} ya está entregado a {lote}" },
	],
});

/** Bodega recibe un rollo o un retazo que regresó del corte. */
export const recibirDelCorte = definirAccion({
	nombre: "inventario.recibir_del_corte",
	descripcion: "Recibe en Bodega un rollo o un retazo que regresó del corte",
	entrada: z.object({ rollo_id: z.uuid().describe("El rollo; en un retazo, su rollo") }),
	salida: z.object({ recepcion_id: z.uuid().describe("La recepción") }),
	permiso: { departamento: "bodega" },
	errores: [{ codigo: "no_por_recibir", mensaje: "{folio} ya está en bodega" }],
	edita: true,
});
