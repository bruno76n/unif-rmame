/**
 * Los contratos de las pestañas Operaciones y Producción por persona: los flujos con sus operaciones, quién hace cada
 * una, su candado y, con «ven sueldos y tarifas», su tarifa; y las piezas buenas de cada persona del Taller.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Operaciones», «Producción por persona» y «Ventanas»)
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";

export const operacionesDeProduccion = definirConsulta({
	nombre: "produccion.operaciones",
	descripcion:
		"Los flujos vigentes con sus operaciones, quién hace cada una y su candado; la tarifa solo con «ven sueldos y tarifas»",
	entrada: z.object({}),
	salida: z.object({
		flujos: z.array(
			z.object({
				flujo_id: z.uuid(),
				nombre: z.string(),
				version: z.number().int().describe("Para agregar o quitar una operación"),
				prendas: z.array(z.string()).describe("Las prendas vigentes que lo usan"),
				lotes_en_proceso: z.number().int().describe("Los lotes en proceso o terminados sin revisar: el candado"),
				operaciones: z.array(
					z.object({
						flujo_operacion_id: z.uuid(),
						operacion: z.string(),
						es_corte: z.boolean(),
						persona_id: z.uuid(),
						persona: z.string(),
						sin_tarifa: z.boolean().describe("Sin tarifa vigente: la pone Personal"),
						tarifa_centavos: z
							.number()
							.int()
							.nullable()
							.optional()
							.describe("La tarifa vigente; solo con «ven sueldos y tarifas»"),
					}),
				),
			}),
		),
		personas: z
			.array(z.object({ persona_id: z.uuid(), nombre: z.string() }))
			.describe("Las activas del Taller, para «La hace»"),
		catalogo: z.array(z.string()).describe("Los nombres de las operaciones vigentes, para proponer"),
		antes_por_omision: z.string().describe("`produccion.operacion_antes_por_omision`"),
	}),
	permiso: { departamento: "produccion" },
});

export const produccionPorPersona = definirConsulta({
	nombre: "produccion.produccion_por_persona",
	descripcion:
		"Las piezas buenas de cada persona del Taller hoy y esta semana, sus operaciones y los lotes donde trabaja. Sin tarifas ni importes",
	entrada: z.object({}),
	salida: z.object({
		personas: z.array(
			z.object({
				persona_id: z.uuid(),
				nombre: z.string(),
				puesto: z.string().nullable(),
				operaciones: z.array(z.string()),
				hoy: z.number().int(),
				semana: z.number().int(),
				lotes: z.array(z.string()),
			}),
		),
	}),
	permiso: { departamento: "produccion" },
});
