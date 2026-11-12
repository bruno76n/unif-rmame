/**
 * Los contratos de lo que Inventario pone en el armazón de la web: las pastillas de Aduana y Bodega y la búsqueda
 * «¿Dónde está?».
 * Fase 19 · docs/interfaz/comunes.md («`inventario.pastillas_menu`», «¿Dónde está?»)
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";

/** La pastilla de un departamento en el menú. */
const pastilla = z.object({
	conteo: z.number().int().describe("Lo que el área tiene que hacer ya"),
	rojo: z.boolean().describe("Si algo está atrasado o urge"),
});

export const pastillasMenu = definirConsulta({
	nombre: "inventario.pastillas_menu",
	descripcion: "Las pastillas de Aduana y Bodega, solo las de los departamentos de la cuenta",
	entrada: z.object({}),
	salida: z.object({
		aduana: pastilla.nullable().describe("Nula si la cuenta no tiene Aduana"),
		bodega: pastilla.nullable().describe("Nula si la cuenta no tiene Bodega"),
	}),
	permiso: { departamento: ["aduana", "bodega"] },
});

export const dondeEsta = definirConsulta({
	nombre: "inventario.donde_esta",
	descripcion:
		"«¿Dónde está?»: por código (4 dígitos o más) o por prenda y talla, hasta 5 variantes con sus piezas en cada ubicación, lo apartado y lo que va de camino",
	entrada: z.object({
		texto: z.string().trim().min(1).max(80),
		limite: z.coerce.number().int().min(1).max(5).optional(),
	}),
	salida: z.object({
		variantes: z.array(
			z.object({
				variante_id: z.uuid(),
				prenda: z.string(),
				talla: z.string(),
				codigo: z.string().nullable(),
				ubicaciones: z.array(z.object({ codigo: z.string(), nombre: z.string(), piezas: z.number().int() })),
				total: z.number().int(),
				comprometidas: z.number().int(),
				libres: z.number().int(),
				apartadas: z.array(z.object({ documento: z.string(), ubicacion: z.string(), piezas: z.number().int() })),
				en_camino: z.array(z.object({ folio: z.string(), piezas: z.number().int(), destino: z.string() })),
			}),
		),
	}),
	permiso: { departamento: ["aduana", "bodega", "direccion"] },
});
