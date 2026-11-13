/**
 * El contrato de la pestaña Recetas de Patronaje: las prendas que llevan receta en tres grupos (sin receta, capturada
 * sin verificar y verificada contra corte), cada renglón ya escrito con sus tallas, su tela, su próximo corte y su
 * desperdicio. La ventana «Capturar receta» usa la misma lista.
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («Recetas» y «Ventanas»: «Capturar receta»)
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";
import { colorDeEstado } from "../estados.ts";

/** Los grupos de Recetas, en su orden. */
export const gruposDeRecetas = ["sin_receta", "sin_verificar", "verificada"] as const;

/** Una prenda en la lista de recetas. */
export const prendaDeLaLista = z.object({
	producto_id: z.uuid().describe("La prenda"),
	prenda: z.string().describe("Su nombre"),
	para: z.string().describe("Su escuela, o «Básico»"),
	color_escuela: z.string().nullable().describe("El color de su escuela; sin escuela, vacío"),
	tallas: z.object({
		rango: z.string().describe("«6 a 14»"),
		cuantas: z.number().int().describe("Cuántas tallas"),
	}),
	tela: z
		.object({
			nombre: z.string().describe("La tela principal"),
			texto: z.string().describe("«0.92 m en talla 10»: los metros en la talla de en medio"),
		})
		.nullable()
		.describe("Según el patrón; sin receta, vacío"),
	materiales: z.number().int().nullable().describe("Cuántos materiales lleva; sin receta, vacío"),
	corte: z
		.object({
			fecha: z.string().describe("«15 oct»"),
			texto: z.string().describe("«15 oct · en 4 días»"),
			rojo: z.boolean().describe("Si no está verificada y se corta en `patronaje.corte_urgente_dias` o menos"),
			detalle: z.string().describe("«L-2026-122 · 190 pzas»"),
		})
		.nullable()
		.describe("Su próximo corte; sin corte, vacío («Sin corte»)"),
	desperdicio: z
		.object({
			texto: z.string().describe("«+6%»"),
			rojo: z.boolean().describe("Si es alto"),
			detalle: z.string().describe("«3 lotes», con «· dato flojo»"),
		})
		.nullable()
		.describe("El medido en corte; sin medir, vacío («Sin medir»)"),
	estado: z.object({ texto: z.string(), color: colorDeEstado }).describe("El estado de la receta"),
});

export const listaDeRecetas = definirConsulta({
	nombre: "patronaje.recetas",
	descripcion:
		"Las prendas que llevan receta, en tres grupos, con su tela, su próximo corte y su desperdicio. Sin dinero",
	entrada: z.object({
		buscar: z.string().trim().max(80).optional().describe("Prenda o escuela"),
		seccion_id: z.uuid().optional().describe("La sección; sin ella, todas"),
	}),
	salida: z.object({
		secciones: z
			.array(z.object({ seccion_id: z.uuid(), nombre: z.string() }))
			.describe("Las secciones que llevan receta, para el filtro"),
		total: z.number().int().describe("Cuántas prendas cumplen la búsqueda"),
		grupos: z
			.array(
				z.object({
					clave: z.enum(gruposDeRecetas),
					nombre: z.string().describe("«Sin receta», «Capturada sin verificar» o «Verificada contra corte»"),
					color: colorDeEstado,
					prendas: z.array(prendaDeLaLista).describe("Las que tienen corte primero, por fecha; luego por nombre"),
				}),
			)
			.describe("Los tres grupos, en su orden; uno sin prendas va vacío"),
	}),
	permiso: { departamento: "patronaje" },
});
