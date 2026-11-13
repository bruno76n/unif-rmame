/**
 * Los contratos de Desarrollo de producto: el tablero (cinco columnas, de la solicitud al catálogo, y los descartados,
 * con lo que pide «Nueva solicitud») y el cajón de un desarrollo, con sus datos, su historial y los botones de su etapa.
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («Desarrollo de producto» y «Cajones»: del desarrollo)
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";
import { colorDeEstado } from "../estados.ts";

/** Las etapas del tablero, en su orden. */
export const etapasDelTablero = ["solicitud", "muestra", "aprobacion", "ficha_tecnica", "en_catalogo"] as const;

/** Para quién es un desarrollo. */
const paraQuien = z.object({
	nombre: z.string().describe("La escuela, o «Básico o general»"),
	color: z.string().nullable().describe("El color de la escuela; sin escuela, vacío"),
});

export const tableroDeDesarrollos = definirConsulta({
	nombre: "patronaje.desarrollos",
	descripcion: "El tablero de los desarrollos de producto, los descartados y las opciones de una solicitud nueva",
	entrada: z.object({}),
	salida: z.object({
		en_proceso: z.number().int().describe("Los que no están en catálogo ni descartados"),
		columnas: z.array(
			z.object({
				etapa: z.enum(etapasDelTablero),
				nombre: z.string(),
				color: colorDeEstado,
				tarjetas: z.array(
					z.object({
						desarrollo_id: z.uuid(),
						folio: z.string(),
						desde: z.string().describe("«desde el 12 sep»: su último movimiento"),
						prenda: z.string(),
						para: paraQuien,
						muestra: z.string().nullable().describe("«En costura, talla M», «Con cambios: {motivo}»…"),
					}),
				),
			}),
		),
		descartados: z.array(
			z.object({
				folio: z.string(),
				prenda: z.string(),
				para: z.string(),
				desde: z.string().describe("«12 sep»"),
				por: z.string().describe("Quién lo descartó"),
				motivo: z.string(),
			}),
		),
		opciones: z.object({
			escuelas: z.array(z.object({ escuela_id: z.uuid(), nombre: z.string() })).describe("Las vivas, por nombre"),
			telas: z.array(z.object({ material_id: z.uuid(), nombre: z.string() })).describe("Las telas vivas de Compras"),
		}),
	}),
	permiso: { departamento: "patronaje" },
});

/** Los botones que puede llevar el cajón, según la etapa y si tiene escuela. */
export const botonesDelDesarrollo = [
	"descartar",
	"empezar_muestra",
	"entregar_muestra",
	"pedir_cambios",
	"aprobo_cliente",
	"alta_en_catalogo",
	"abrir_receta",
] as const;

export const desarrolloDePatronaje = definirConsulta({
	nombre: "patronaje.desarrollo",
	descripcion: "Un desarrollo: sus pasos, sus datos, su ficha técnica, su historial y los botones de su etapa",
	entrada: z.object({ desarrollo_id: z.uuid().describe("El desarrollo") }),
	salida: z.object({
		desarrollo_id: z.uuid(),
		folio: z.string(),
		version: z.number().int().describe("Para sus acciones"),
		prenda: z.string(),
		para: paraQuien,
		con_escuela: z.boolean().describe("Con escuela aprueba el cliente; sin ella, Dirección"),
		paso: z.number().int().describe("El paso actual, de 0 (Solicitud) a 4 (En catálogo); descartado, -1"),
		datos: z.object({
			solicito: z.string().describe("«12 sep»"),
			muestra: z.string().describe("«Talla M, entregada el 8 oct» o «Todavía no»"),
			en_catalogo: z.object({ producto_id: z.uuid(), nombre: z.string() }).nullable(),
		}),
		ficha: z.object({
			que_pidieron: z.string(),
			tela: z.string().describe("«Gabardina azul marino, Ancho 1.50 m»"),
			tallas: z.string(),
			receta: z.string().describe("«Versión 2, sin verificar» o «Se captura al dar de alta el producto en catálogo»"),
		}),
		autorizacion: z.string().nullable().describe("«AU-0012 · Esperando aprobación de Dirección»"),
		historial: z
			.array(z.object({ paso_id: z.uuid(), quien: z.string(), que: z.string(), fecha: z.string() }))
			.describe("Lo más nuevo arriba"),
		botones: z.array(z.enum(botonesDelDesarrollo)).describe("Los de su etapa"),
	}),
	permiso: { departamento: "patronaje" },
});
