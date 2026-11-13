/**
 * El contrato de Pendientes de Calidad: las tres cifras de arriba (Por revisar, Defectos y Reclamos) y la cola de
 * trabajo (lotes por revisar, reprocesos, devoluciones de clientes y reclamos), cada renglón ya escrito con su estado y
 * lo que su botón necesita. Sin precios, importes, tarifas ni sueldos.
 * Fase 19 · docs/interfaz/fabrica/calidad.md («Pendientes» y «Quién entra»)
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";
import { colorDeEstado } from "../estados.ts";

/** Los grupos de Pendientes, que son también sus filtros. */
export const gruposDePendientesDeCalidad = ["todos", "lotes", "devoluciones", "reclamos"] as const;

/** Lo común de cada renglón de Pendientes. */
const comun = {
	clave: z.string().describe("La clave del renglón"),
	titulo: z.string().describe("La referencia: qué es («L-2026-121 · Pantalón gris oxford»)"),
	detalle: z.string().describe("Abajo de la referencia: su detalle"),
	fecha: z.string().nullable().describe("La fecha que importa, ya escrita («Entrega 3 nov»); vacía si no lleva"),
	fecha_orden: z.string().nullable().describe("La fecha que ordena (ISO)"),
	fecha_roja: z.boolean().describe("Si la fecha va en rojo"),
	cifra: z.string().describe("Las piezas, ya escritas («90 pz»)"),
	estado: z.string().describe("El estado, en su forma fija"),
	color: colorDeEstado,
};

/** Un renglón de Pendientes, con lo que su botón necesita. */
export const renglonDePendientesDeCalidad = z.discriminatedUnion("tipo", [
	z.object({
		tipo: z.literal("lote"),
		...comun,
		lote_id: z.uuid().describe("El lote, para abrir su revisión"),
		urgente: z.boolean().describe("Si es «Por revisar hoy»: su botón va en negro"),
	}),
	z.object({
		tipo: z.literal("reproceso"),
		...comun,
		reproceso_id: z.uuid().describe("El reproceso, para «Aprobar»"),
		version: z.number().int().describe("Su versión"),
		puede_aprobar: z.boolean().describe("Si Aduana ya recibió su lote: solo entonces sale «Aprobar»"),
	}),
	z.object({
		tipo: z.literal("devolucion"),
		...comun,
		traspaso_id: z.uuid().describe("La devolución en aduana, para la ventana Revisar devolución"),
	}),
	z.object({
		tipo: z.literal("reclamo"),
		...comun,
		reclamo_id: z.uuid().describe("El reclamo, para abrirlo en Reclamos"),
	}),
]);

/** Un defecto con sus piezas rechazadas. */
export const defectoContado = z.object({
	nombre: z.string().describe("El defecto"),
	piezas: z.number().int().describe("Las piezas rechazadas con ese defecto en el periodo"),
});

export const pendientesDeCalidad = definirConsulta({
	nombre: "calidad.pendientes",
	descripcion:
		"Pendientes de Calidad: las cifras de lotes por revisar, defectos y reclamos, y la cola de trabajo con su botón. Sin dinero",
	entrada: z.object({
		grupo: z.enum(gruposDePendientesDeCalidad).optional().describe("El filtro; sin él, todos"),
	}),
	salida: z.object({
		indicadores: z.object({
			por_revisar: z.object({
				lotes: z.number().int().describe("Los lotes terminados esperando revisión"),
				piezas: z.number().int().describe("Sus piezas listas"),
				en_reproceso: z.number().int().describe("Las piezas en reproceso"),
			}),
			defectos: z.object({
				dias: z.number().int().describe("`calidad.defectos_periodo_dias`"),
				porcentaje: z.number().describe("Las rechazadas entre las revisadas del periodo, en %, con un decimal"),
				comunes: z.array(defectoContado).describe("Los tres defectos más comunes del periodo"),
			}),
			reclamos: z.object({
				por_resolver: z.number().int().describe("Los reclamos por resolver"),
				en_el_anio: z.number().int().describe("Los reclamos del año"),
			}),
		}),
		conteos: z
			.object({
				todos: z.number().int(),
				lotes: z.number().int(),
				devoluciones: z.number().int(),
				reclamos: z.number().int(),
			})
			.describe("Cuántos renglones tiene cada filtro"),
		hay_rojo: z.boolean().describe("Si algún renglón va en rojo: la pestaña va en rojo"),
		renglones: z.array(renglonDePendientesDeCalidad).describe("Los renglones del filtro"),
	}),
	permiso: { departamento: "calidad" },
});
