/**
 * Los contratos de los grupos de tallas y los tipos de prenda.
 * Fase 8 · docs/modulos/catalogo/tallas-y-tipos-de-prenda.md («Acciones»)
 *
 * Guardar crea o cambia: sin id es nuevo, y con id lleva la versión que se leyó en sus datos (decisión 432).
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** La versión que se leyó, si ya existe. */
const versionSiExiste = z.number().int().nonnegative().optional().describe("La versión que se leyó, si ya existe");

/** Catálogo guarda un grupo de tallas con sus tallas y su orden. */
export const guardarGrupoTalla = definirAccion({
	nombre: "catalogo.guardar_grupo_talla",
	descripcion: "Guarda un grupo de tallas: sus tallas nuevas, sus nombres y su orden",
	entrada: z.object({
		grupo_talla_id: z.uuid().optional().describe("El grupo; sin él es nuevo"),
		nombre: z.string().trim().min(3, "Escribe el nombre del grupo.").max(40).describe("El grupo"),
		tallas: z
			.array(
				z.object({
					talla_id: z.uuid().optional().describe("La talla; sin ella es nueva"),
					nombre: z
						.string()
						.trim()
						.min(1, "Escribe la talla.")
						.max(10, "La talla va en 10 letras.")
						.describe("La talla"),
					orden: z.number().int().nonnegative().describe("Su lugar en el grupo"),
				}),
			)
			.min(1, "Agrega al menos una talla.")
			.describe("Las tallas del grupo, todas"),
		version: versionSiExiste,
	}),
	salida: z.object({ grupo_talla_id: z.uuid().describe("El grupo"), version: z.number().int() }),
	permiso: { departamento: "catalogo" },
	errores: [
		{ codigo: "grupo_repetido", mensaje: "Ese grupo de tallas ya existe." },
		{ codigo: "talla_repetida", mensaje: "Esa talla ya está en el grupo." },
		{ codigo: "talla_en_uso", mensaje: "Esa talla ya la usan productos: no se renombra ni se quita." },
	],
});

/** Catálogo guarda un tipo de prenda con sus medidas iniciales por talla. */
export const guardarTipoPrenda = definirAccion({
	nombre: "catalogo.guardar_tipo_prenda",
	descripcion: "Guarda un tipo de prenda y sus medidas iniciales, en centímetros, por talla",
	entrada: z.object({
		tipo_prenda_id: z.uuid().optional().describe("El tipo; sin él es nuevo"),
		nombre: z.string().trim().min(3, "Escribe el nombre del tipo.").max(40).describe("El tipo de prenda"),
		seccion_id: z.uuid("Escoge la sección.").describe("Su sección, que lleva receta"),
		medidas: z
			.array(
				z.object({
					medida: z.string().trim().min(3, "La medida lleva al menos 3 letras.").max(40).describe("«Largo», «Pecho»"),
					orden: z.number().int().nonnegative().describe("El orden del renglón"),
					valores: z
						.array(
							z.object({
								talla_id: z.uuid().describe("La talla"),
								valor_cm: z.number().positive().nullable().describe("Centímetros, o vacío"),
							}),
						)
						.describe("Por talla"),
				}),
			)
			.describe("Sus medidas; puede ir vacía"),
		version: versionSiExiste,
	}),
	salida: z.object({ tipo_prenda_id: z.uuid().describe("El tipo"), version: z.number().int() }),
	permiso: { departamento: "catalogo" },
	errores: [
		{ codigo: "tipo_repetido", mensaje: "Ese tipo de prenda ya existe." },
		{ codigo: "medida_repetida", mensaje: "Esa medida ya está en las medidas" },
		{ codigo: "seccion_sin_receta", mensaje: "Esa sección no lleva receta: sus productos no tienen medidas." },
	],
});
