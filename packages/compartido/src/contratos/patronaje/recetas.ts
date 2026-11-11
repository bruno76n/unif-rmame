/**
 * El contrato de la receta: guardarla como versión nueva, con sus medidas y sus materiales.
 * Fase 10 · docs/modulos/patronaje/recetas.md («`patronaje.guardar_receta`»)
 *
 * Las reglas que dependen de lo guardado (las tallas del producto, los materiales, los parámetros) las revisa la
 * acción, con los textos de la muestra. Las cantidades viajan como texto decimal con hasta tres decimales.
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** El papel de un material en la receta. */
export const papelesDeLaReceta = ["tela_principal", "combinacion", "forro", "avio"] as const;

/** Las unidades en que se captura un material. */
export const unidadesDeLaReceta = ["m", "cm", "pza"] as const;

/** Un decimal sin signo con hasta tres decimales, en texto. */
export const cantidad = z
	.string("Escribe un número")
	.trim()
	.regex(/^\d{1,9}(\.\d{1,3})?$/, "Escribe un número")
	.describe("Decimal con hasta tres decimales");

/** El valor de una talla. */
const deUnaTalla = z.object({
	talla_id: z.uuid().describe("La talla"),
	cantidad: z
		.string("Escribe un número")
		.trim()
		.max(20, "Escribe un número")
		.describe(
			"Decimal con hasta tres decimales; vacía es que falta; si no es número, «{material}: revisa la talla {t}»",
		),
});

/** Patronaje guarda la receta de una prenda como versión nueva. */
export const guardarReceta = definirAccion({
	nombre: "patronaje.guardar_receta",
	descripcion: "Guarda la receta de una prenda como versión nueva: sus medidas y sus materiales",
	entrada: z.object({
		producto_id: z.uuid().describe("La prenda"),
		motivo: z
			.string()
			.trim()
			.max(120, "El motivo va de 5 a 120 letras")
			.optional()
			.describe("Obligatorio si ya hay versión: por qué cambia"),
		medidas: z
			.array(
				z.object({
					medida: z.string().trim().min(3, "La medida lleva al menos 3 letras").max(60).describe("Su nombre"),
					orden: z.number().int().nonnegative().describe("El orden del renglón"),
					valores: z
						.array(z.object({ talla_id: z.uuid().describe("La talla"), valor_cm: cantidad.describe("Centímetros") }))
						.describe("Por talla"),
				}),
			)
			.describe("Puede ir vacía"),
		lineas: z
			.array(
				z.object({
					papel: z.enum(papelesDeLaReceta).describe("Una sola `tela_principal`"),
					material_id: z.uuid().describe("El material"),
					modo: z.enum(["igual", "por_talla"]).describe("Igual en todas las tallas o por talla; las telas, por talla"),
					unidad_receta: z.enum(unidadesDeLaReceta).describe("La unidad en que se captura"),
					cantidad: cantidad.optional().describe("Por prenda, con `igual`"),
					tallas: z.array(deUnaTalla).optional().describe("Por talla, con `por_talla`"),
					orden: z.number().int().nonnegative().describe("El orden en su tabla"),
				}),
			)
			.describe("Los materiales de la receta"),
	}),
	salida: z.object({
		receta_version_id: z.uuid().describe("La versión nueva"),
		numero: z.number().int().describe("Su número"),
		estado: z.enum(["sin_verificar", "verificada"]).describe("El estado de la receta"),
		perdio_verificacion: z.boolean().describe("Si estaba verificada y cambió la tela o los avíos"),
	}),
	permiso: { departamento: "patronaje" },
	errores: [
		{ codigo: "tela_en_metros", mensaje: "La tela va en metros por prenda, talla por talla." },
		{ codigo: "unidad_sin_conversion", mensaje: "Ese material no se captura en esa unidad." },
		{ codigo: "material_tipo_no_cuadra", mensaje: "Ese material no va en esa tabla." },
		{ codigo: "material_repetido", mensaje: "Ese material ya está en la receta." },
		{ codigo: "material_dado_de_baja", mensaje: "Ese material está dado de baja en Compras." },
		{ codigo: "talla_ajena", mensaje: "Esa talla no es de la prenda." },
		{ codigo: "seccion_sin_receta", mensaje: "Su sección no lleva receta." },
		{ codigo: "sin_cambios", mensaje: "Sin cambios" },
	],
	edita: true,
});
