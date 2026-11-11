/**
 * El contrato de las excepciones de inventario: resolver una, diciendo qué se hizo.
 * Fase 9 · docs/modulos/inventario/excepciones.md («`inventario.resolver_excepcion`»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/**
 * Bodega resuelve una excepción; las del taller también Producción, y las de dinero, Contaduría. No mueve nada:
 * dice qué se hizo. Quién puede, según el tipo y el área, lo revisa la acción.
 */
export const resolverExcepcion = definirAccion({
	nombre: "inventario.resolver_excepcion",
	descripcion: "Resuelve una excepción con lo que se hizo; no mueve inventario",
	entrada: z.object({
		excepcion_id: z.uuid().describe("La excepción"),
		resolucion: z
			.string("Escribe qué se hizo")
			.trim()
			.max(500)
			.describe("Qué se hizo, al menos `general.largo_minimo_motivo` letras"),
	}),
	salida: z.object({}),
	permiso: {},
	errores: [{ codigo: "ya_resuelta", mensaje: "Esa excepción ya está resuelta." }],
	edita: true,
});
