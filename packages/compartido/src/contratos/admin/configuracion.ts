/**
 * Los contratos de la configuración: los parámetros, las listas y los datos de la empresa.
 * Fase 4 · docs/modulos/admin/configuracion.md («Acciones»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** Cambia el valor de un parámetro. Solo la dueña. */
export const cambiarParametro = definirAccion({
	nombre: "admin.cambiar_parametro",
	descripcion: "Cambia el valor de un parámetro del negocio; deja su historial y su bitácora",
	entrada: z.object({
		clave: z.string().min(1).describe("La clave del parámetro: `produccion.lote_atorado_dias`"),
		ubicacion_id: z.uuid().optional().describe("Para un valor por ubicación"),
		valor: z
			.union([z.number(), z.string(), z.boolean(), z.null()])
			.describe("El valor según su tipo; centavos en enteros, la hora como «HH:MM»; vacío solo si lo acepta"),
	}),
	salida: z.object({}),
	permiso: { departamento: "admin", soloDuena: true },
	edita: true,
});

/** Agrega un valor al final de una lista. */
export const agregarALista = definirAccion({
	nombre: "admin.agregar_a_lista",
	descripcion: "Agrega un valor al final de una lista sencilla (categorías de gasto, unidades de material…)",
	entrada: z.object({
		lista: z.string().min(1).describe("La clave de la lista: `categorias_gasto`"),
		nombre: z.string().trim().min(1, "Escribe el nombre.").describe("El nombre del valor nuevo"),
		se_cuenta_entera: z.boolean().optional().describe("Solo en las unidades de material: si se cuenta entera"),
	}),
	salida: z.object({ id: z.uuid().describe("El id del valor nuevo") }),
	permiso: { departamento: "admin" },
	errores: [{ codigo: "ya_esta", mensaje: "Ya está en la lista." }],
});

/** Cambia los datos de la empresa. Solo la dueña. */
export const editarEmpresa = definirAccion({
	nombre: "admin.editar_empresa",
	descripcion: "Cambia los datos de la empresa que salen en las hojas y en el ticket",
	entrada: z.object({
		razon_social: z.string().trim().min(3, "Escribe la razón social.").max(120).describe("La razón social"),
		nombre_comercial: z.string().trim().min(2).max(60).describe("La marca de la pantalla de acceso"),
		rfc: z
			.string()
			.transform((rfc) => rfc.replace(/\s/g, "").toUpperCase())
			.pipe(z.string().length(12, "El RFC de una empresa lleva 12 caracteres."))
			.describe("El RFC de persona moral; se guarda en mayúsculas y sin espacios"),
		domicilio: z.string().trim().min(10, "Escribe el domicilio fiscal.").max(200).describe("La dirección fiscal"),
	}),
	salida: z.object({}),
	permiso: { departamento: "admin", soloDuena: true },
	edita: true,
});
