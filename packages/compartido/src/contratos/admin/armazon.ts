/**
 * Los contratos de las consultas del armazón de la web: el menú con la cuenta y sus pastillas, «Mis sesiones», la
 * campana de avisos y el historial de un documento.
 * Fase 19 · docs/interfaz/comunes.md («Sus consultas», «`admin.historial_entidad`»)
 */

import { z } from "zod";
import { definirConsulta, paginaDe, parametrosDePagina } from "../definir.ts";
import { clavesDeDepartamento } from "./cuentas.ts";

/** Los grupos del menú lateral; Dirección va sin grupo. */
export const gruposDelMenu = ["operacion", "taller", "almacen", "administracion"] as const;

export const armazon = definirConsulta({
	nombre: "admin.armazon",
	descripcion:
		"El menú, la cuenta y sus pastillas: los departamentos de la cuenta con su conteo, sus permisos finos, sus avisos sin leer y la versión mínima de la web",
	entrada: z.object({}),
	salida: z.object({
		cuenta: z.object({
			nombre: z.string(),
			iniciales: z.string(),
			correo: z.string(),
			puesto: z.string().describe("Su departamento, «Varios» si tiene más, o «Administradora principal»"),
			es_duena: z.boolean(),
			es_soporte: z.boolean(),
		}),
		departamentos: z.array(
			z.object({
				clave: z.enum(clavesDeDepartamento),
				nombre: z.string(),
				grupo: z.enum(gruposDelMenu).nullable(),
				orden: z.number().int(),
				conteo: z.number().int().nullable().describe("Lo que tiene que hacer ya; nulo si no lleva pastilla"),
				rojo: z.boolean().describe("Si algo está atrasado"),
			}),
		),
		permisos_finos: z.array(z.string()),
		avisos_sin_leer: z.number().int(),
		confirmado_hasta: z.string().nullable().describe("Hasta cuándo vale su «Confirmar con Google»"),
		version_minima_web: z.string(),
		servidor_en: z.string(),
	}),
	permiso: {},
});

export const misSesiones = definirConsulta({
	nombre: "admin.mis_sesiones",
	descripcion: "Las sesiones abiertas de la cuenta, con cuál es esta",
	entrada: z.object({}),
	salida: z.object({
		sesiones: z.array(
			z.object({
				id: z.uuid(),
				aparato: z.string().nullable(),
				ciudad: z.string().nullable(),
				ip: z.string().nullable(),
				entro_en: z.string(),
				ultima_actividad_en: z.string(),
				es_esta: z.boolean(),
			}),
		),
	}),
	permiso: {},
});

export const misAvisos = definirConsulta({
	nombre: "admin.mis_avisos",
	descripcion: "Los avisos de la cuenta, el más nuevo arriba, y cuántos van sin leer",
	entrada: z.object({
		solo_sin_leer: z.enum(["si", "no"]).optional().describe("«si» para ver solo los que no ha leído"),
		...parametrosDePagina(50),
	}),
	salida: z.object({
		...paginaDe(
			z.object({
				id: z.uuid(),
				tipo: z.string(),
				texto: z.string(),
				enlace: z.string().nullable(),
				creado_en: z.string(),
				leido: z.boolean(),
			}),
		),
		sin_leer: z.number().int(),
	}),
	permiso: {},
});

export const historialEntidad = definirConsulta({
	nombre: "admin.historial_entidad",
	descripcion:
		"El historial de un documento, de su bitácora: lo ve quien lee su tabla; sin montos para quien solo tiene Aduana o Bodega, y con el recorte de sueldos",
	entrada: z.object({
		entidad: z.string().min(1).max(80),
		entidad_id: z.uuid(),
		...parametrosDePagina(50),
	}),
	salida: z.object({
		...paginaDe(
			z.object({
				ocurrido_en: z.string(),
				quien: z.string(),
				departamento: z.string().nullable(),
				descripcion: z.string(),
				antes: z.record(z.string(), z.unknown()).nullable(),
				despues: z.record(z.string(), z.unknown()).nullable(),
			}),
		),
	}),
	permiso: {},
});
