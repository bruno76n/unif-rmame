/**
 * El contrato de `inventario.ultimo_cuadre`: el último cuadre de inventario de la noche, para Dirección y Bodega.
 * Fase 19 · docs/interfaz/fabrica/direccion.md («Alertas cruzadas», «`inventario.ultimo_cuadre`»)
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";

/** El último cuadre: lo mismo que la lectura del mismo nombre. */
export const ultimoCuadre = definirConsulta({
	nombre: "inventario.ultimo_cuadre",
	descripcion:
		"El último cuadre de inventario: su fecha, su estado, cuándo empezó y terminó, sus contadores y su error",
	entrada: z.object({}),
	salida: z.object({
		cuadre: z
			.object({
				cuadre_id: z.uuid(),
				fecha: z.string().describe("El día de negocio del cuadre"),
				estado: z.enum(["corriendo", "cuadro", "con_residuo", "fallo"]).describe("Cómo quedó"),
				iniciado_en: z.string().describe("Cuándo empezó"),
				terminado_en: z.string().nullable().describe("Cuándo terminó; nulo mientras corre"),
				renglones_revisados: z.number().int(),
				proyecciones_corregidas: z.number().int(),
				diferencias_creadas: z.number().int().describe("Las diferencias que dejó en Bodega"),
				excepciones_creadas: z.number().int().describe("Las excepciones que dejó en Bodega"),
				error: z.string().nullable().describe("Por qué falló, si falló"),
			})
			.nullable()
			.describe("Nulo si todavía no corre ninguno"),
	}),
	permiso: { departamento: ["direccion", "bodega"] },
});
