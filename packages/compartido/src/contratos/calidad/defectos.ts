/**
 * El contrato de la pestaña Defectos: el periodo (`calidad.defectos_periodo_dias`), los defectos del periodo con su
 * conteo, la tasa de rechazo por operación y por persona (regla 9 de docs/modulos/calidad/revision-de-lotes.md) y el
 * catálogo de defectos con sus operaciones.
 * Fase 19 · docs/interfaz/fabrica/calidad.md («Defectos» y la ventana «Defecto nuevo»)
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";
import { defectoContado } from "./pendientes.ts";

/** Un renglón de «Por operación» o «Por persona». */
export const tasaDeDefectos = z.object({
	nombre: z.string().describe("La operación o la persona"),
	rechazadas: z.number().int().describe("Sus piezas rechazadas en el periodo"),
	tasa: z.number().describe("Sus rechazadas entre las revisadas que le tocan, en %, con un decimal"),
	contra_la_mas_alta: z.number().describe("Su tasa entre la más alta de su tabla, de 0 a 1: el largo de su barra"),
	roja: z.boolean().describe("Si pasa de `calidad.defectos_tasa_roja_porcentaje`: roja; si no, ámbar"),
	mas_comun: z.string().describe("Su defecto más común"),
});

export const defectosDeCalidad = definirConsulta({
	nombre: "calidad.defectos",
	descripcion:
		"Defectos: las piezas revisadas y rechazadas del periodo, cada defecto con su conteo, la tasa por operación y por persona, y el catálogo",
	entrada: z.object({}),
	salida: z.object({
		dias: z.number().int().describe("`calidad.defectos_periodo_dias`"),
		revisadas: z.number().int().describe("Las piezas revisadas en el periodo"),
		lotes: z.number().int().describe("Los lotes revisados en el periodo"),
		rechazadas: z.number().int().describe("Las piezas rechazadas en el periodo"),
		porcentaje: z.number().describe("Las rechazadas entre las revisadas, en %, con un decimal"),
		del_periodo: z.array(defectoContado).describe("Los defectos del periodo, del más común al menos común"),
		por_operacion: z.array(tasaDeDefectos).describe("Solo las que tienen rechazos, de la tasa más alta a la más baja"),
		por_persona: z.array(tasaDeDefectos).describe("Solo las que tienen rechazos, de la tasa más alta a la más baja"),
		catalogo: z
			.array(
				z.object({
					defecto_id: z.uuid().describe("El defecto"),
					nombre: z.string().describe("Su nombre"),
					operaciones: z.array(z.string()).describe("Las operaciones donde pasa"),
				}),
			)
			.describe("El catálogo de defectos vigentes"),
		operaciones: z
			.array(z.object({ operacion_id: z.uuid(), nombre: z.string() }))
			.describe("Las operaciones vigentes del catálogo, para «Defecto nuevo»"),
	}),
	permiso: { departamento: "calidad" },
});
