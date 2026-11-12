/**
 * Los contratos de las escuelas y las secciones del catálogo, y la paleta de colores de las escuelas.
 * Fase 8 · docs/modulos/catalogo/escuelas-y-secciones.md («Acciones») y docs/interfaz/DISENO.md («La paleta de
 * escuelas»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** Los colores de las escuelas, en el orden en que el servidor los da; al acabarse, vuelve a empezar. */
export const paletaDeEscuelas = ["#0F7C6B", "#C0432B", "#5B4BA8", "#2A6FA3", "#9A7B14", "#8C3F6B"] as const;

/** El nombre y el municipio de una escuela. */
const datosDeEscuela = {
	nombre: z
		.string("Escribe el nombre completo de la escuela.")
		.trim()
		.min(4, "Escribe el nombre completo de la escuela.")
		.max(80, "Escribe el nombre completo de la escuela.")
		.describe("El nombre de la escuela"),
	municipio: z
		.string("Escribe el municipio.")
		.trim()
		.min(3, "Escribe el municipio.")
		.max(60, "Escribe el municipio.")
		.describe("Su municipio"),
};

/** La escuela repetida. */
const escuelaRepetida = { codigo: "escuela_repetida", mensaje: "Esa escuela ya existe." } as const;

/** Catálogo agrega una escuela con modelos propios. */
export const agregarEscuela = definirAccion({
	nombre: "catalogo.agregar_escuela",
	descripcion: "Agrega una escuela para crearle modelos; el servidor le da su color",
	entrada: z.object(datosDeEscuela),
	salida: z.object({ escuela_id: z.uuid().describe("La escuela"), color: z.string().describe("Su color") }),
	permiso: { departamento: "catalogo" },
	errores: [escuelaRepetida],
});

/** Catálogo cambia el nombre o el municipio de una escuela. */
export const editarEscuela = definirAccion({
	nombre: "catalogo.editar_escuela",
	descripcion: "Cambia el nombre o el municipio de una escuela",
	entrada: z.object({ escuela_id: z.uuid().describe("La escuela"), ...datosDeEscuela }),
	salida: z.object({}),
	permiso: { departamento: "catalogo" },
	errores: [escuelaRepetida],
	edita: true,
});

/** Catálogo da de baja una escuela que nada usa. */
export const darBajaEscuela = definirAccion({
	nombre: "catalogo.dar_baja_escuela",
	descripcion: "Da de baja una escuela sin modelos activos; sus modelos y su historial se conservan",
	entrada: z.object({
		escuela_id: z.uuid().describe("La escuela"),
		motivo: z.string().trim().max(200).describe("Por qué, al menos `general.largo_minimo_motivo` letras"),
	}),
	salida: z.object({}),
	permiso: { departamento: "catalogo" },
	errores: [
		{ codigo: "ya_dada_de_baja", mensaje: "Ya está dada de baja." },
		{ codigo: "escuela_con_modelos", mensaje: "Tiene modelos activos: descontinúalos antes de darla de baja." },
		{ codigo: "escuela_con_desarrollos", mensaje: "Tiene desarrollos en proceso." },
		{
			codigo: "escuela_de_cliente",
			mensaje: "{escuela} es de {cliente}, que sigue activo: se da de baja con el cliente en Ventas a externos.",
		},
	],
	edita: true,
});

/** Catálogo reactiva una escuela dada de baja. */
export const reactivarEscuela = definirAccion({
	nombre: "catalogo.reactivar_escuela",
	descripcion: "Reactiva una escuela dada de baja; sus productos siguen como estaban",
	entrada: z.object({ escuela_id: z.uuid().describe("La escuela") }),
	salida: z.object({}),
	permiso: { departamento: "catalogo" },
	errores: [{ codigo: "escuela_activa", mensaje: "Ya está activa." }],
	edita: true,
});

/** La dueña agrega una sección del catálogo, al final del orden. */
export const agregarSeccion = definirAccion({
	nombre: "catalogo.agregar_seccion",
	descripcion: "Agrega una sección del catálogo al final del orden",
	entrada: z.object({
		nombre: z.string().trim().min(3, "Escribe el nombre de la sección.").max(40).describe("La sección"),
		lleva_receta: z.boolean().optional().describe("Si sus productos llevan receta; sí, si no viene"),
		tipo_prenda_defecto_id: z.uuid().optional().describe("El tipo de prenda que propone el alta"),
	}),
	salida: z.object({ seccion_id: z.uuid().describe("La sección") }),
	permiso: { departamento: "admin", soloDuena: true },
	errores: [{ codigo: "seccion_repetida", mensaje: "Ya está en la lista." }],
});
