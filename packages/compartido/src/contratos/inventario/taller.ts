/**
 * Los contratos de la recepción del taller: Aduana recibe a ciegas un lote revisado o un reproceso aprobado.
 * Fase 14 · docs/modulos/inventario/recepcion-del-taller.md («Acciones»)
 *
 * Nada de lo que regresan dice lo que aprobó Calidad: Aduana cuenta a ciegas.
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** Lo que contó Aduana de una talla: de 0 a 9999. */
const piezasContadas = z
	.number("Cuenta esta talla, aunque sea 0")
	.int("Número entero")
	.min(0, "Número entero")
	.max(9999, "Número entero");

/** Aduana recibe un lote revisado, contado a ciegas talla por talla. */
export const recibirDelTaller = definirAccion({
	nombre: "inventario.recibir_del_taller",
	descripcion: "Recibe en aduana un lote revisado, contado a ciegas: nacen sus A- por destino y se consumen sus avíos",
	entrada: z.object({
		lote_id: z.uuid().describe("El lote"),
		tallas: z
			.array(
				z.object({
					variante_id: z.uuid().describe("La talla"),
					piezas: piezasContadas.describe("Lo que contó Aduana, aunque sea 0"),
				}),
			)
			.min(1, "Cuenta esta talla, aunque sea 0")
			.describe("Una por cada talla que revisó Calidad"),
	}),
	salida: z.object({
		recepcion_id: z.uuid().describe("La recepción"),
		traspaso_ids: z.array(z.uuid()).describe("Los A- que nacieron, uno por destino"),
	}),
	permiso: { departamento: "aduana" },
	errores: [
		{ codigo: "lote_no_revisado", mensaje: "{lote} todavía no lo revisa Calidad." },
		{ codigo: "lote_ya_recibido", mensaje: "{lote} ya se recibió en aduana." },
	],
});

/** Aduana recibe un reproceso aprobado, contado a ciegas. */
export const recibirReproceso = definirAccion({
	nombre: "inventario.recibir_reproceso",
	descripcion: "Recibe en aduana un reproceso aprobado, contado a ciegas, con el reparto de su lote",
	entrada: z.object({
		reproceso_id: z.uuid().describe("El reproceso"),
		piezas: z
			.number("Escribe cuántas llegaron, aunque sea 0.")
			.int("Escribe cuántas llegaron, aunque sea 0.")
			.min(0, "Escribe cuántas llegaron, aunque sea 0.")
			.max(9999, "Escribe cuántas llegaron, aunque sea 0.")
			.describe("Lo que contó Aduana: un reproceso es de una sola talla"),
	}),
	salida: z.object({
		recepcion_id: z.uuid().describe("La recepción"),
		traspaso_ids: z.array(z.uuid()).describe("El A- que nació, si llegó algo"),
	}),
	permiso: { departamento: "aduana" },
	errores: [
		{ codigo: "reproceso_no_listo", mensaje: "{reproceso} todavía no lo aprueba Calidad." },
		{ codigo: "reproceso_ya_recibido", mensaje: "{reproceso} ya se recibió." },
	],
});
