/**
 * Los contratos de la pestaña Reclamos: la lista con el reclamo escogido y su rastreo (`calidad.reclamos`), el
 * buscador por código de la prenda, lote o reclamo (`calidad.buscar`) y las opciones de la ventana «Reclamo nuevo»
 * (`calidad.opciones_reclamo`). El rastreo se calcula, no se guarda (regla 5 de
 * docs/modulos/calidad/reclamos-y-devoluciones.md), y no lleva costos ni tarifas.
 * Fase 19 · docs/interfaz/fabrica/calidad.md («Reclamos» y la ventana «Reclamo nuevo»)
 */

import { z } from "zod";
import { definirConsulta, paginaDe, parametrosDePagina } from "../definir.ts";
import { colorDeEstado } from "../estados.ts";

/** Un reclamo de la lista. */
export const reclamoDeLaLista = z.object({
	reclamo_id: z.uuid().describe("El reclamo"),
	folio: z.string().describe("Su folio RC-"),
	estado: z.string().describe("«Por resolver» o «Resuelto»"),
	color: colorDeEstado,
	cliente: z.string().describe("El cliente o la tienda"),
	linea: z.string().describe("«{defecto} · {n} piezas · {fecha}»"),
});

/** El rastreo del reclamo escogido: los cinco pasos, del código de la prenda a la partida de tela. */
export const reclamoEscogido = z.object({
	reclamo_id: z.uuid().describe("El reclamo"),
	version: z.number().int().describe("Su versión, para «Marcar resuelto»"),
	folio: z.string().describe("Su folio"),
	cliente: z.string().describe("El cliente o la tienda"),
	que_dice: z.string().describe("Lo que reclamó"),
	por_resolver: z.boolean().describe("Si sigue por resolver: sale «Marcar resuelto»"),
	resolucion: z.string().nullable().describe("«Resuelto el {fecha}: {resolución}»; vacío si sigue por resolver"),
	prenda: z.object({
		titulo: z.string().describe("«{prenda} · talla {t}»"),
		linea: z.string().describe("«Código {código}»"),
	}),
	lote: z.object({
		titulo: z.string().describe("El folio del lote"),
		linea: z.string().describe("«Cortado el {fecha} · revisado el {fecha} por {persona}» y la nota de entrega"),
	}),
	operacion: z.object({ titulo: z.string().describe("La operación"), linea: z.string().describe("El defecto") }),
	persona: z.object({
		titulo: z.string().describe("Quién la hizo"),
		linea: z.string().describe("«Hizo {operación} en ese lote»"),
	}),
	partidas: z
		.array(
			z.object({ titulo: z.string().describe("La partida"), linea: z.string().describe("«{tela} · {proveedor}»") }),
		)
		.describe("Las partidas de tela del corte; si el lote mezcló partidas, todas"),
});

export const reclamosDeCalidad = definirConsulta({
	nombre: "calidad.reclamos",
	descripcion:
		"Reclamos: la lista (primero los por resolver, luego los más nuevos) y el rastreo del escogido, sin costos ni tarifas",
	entrada: z.object({
		reclamo_id: z.uuid().optional().describe("El reclamo escogido; sin él, el primero de la lista"),
		...parametrosDePagina(100),
	}),
	salida: z.object({
		...paginaDe(reclamoDeLaLista),
		escogido: reclamoEscogido.nullable().describe("El rastreo del escogido; vacío si no hay reclamos"),
	}),
	permiso: { departamento: "calidad" },
});

export const buscarDeCalidad = definirConsulta({
	nombre: "calidad.buscar",
	descripcion: "Busca por código de la prenda, folio de lote o folio de reclamo",
	entrada: z.object({
		texto: z.string().trim().min(1).max(40).describe("Lo que se escribió en el buscador"),
	}),
	salida: z.object({
		encontrado: z.discriminatedUnion("tipo", [
			z.object({ tipo: z.literal("reclamo"), reclamo_id: z.uuid().describe("El reclamo que se encontró") }),
			z.object({
				tipo: z.literal("prenda"),
				titulo: z.string().describe("«{prenda} · talla {t}»"),
				linea: z
					.string()
					.describe("«Código {código}. Se hizo en {n} lotes: {lotes}.» o «… Todavía no hay lotes de esta prenda.»"),
			}),
			z.object({
				tipo: z.literal("nada"),
				texto: z.string().describe("«No hay ninguna prenda, lote ni reclamo con …»"),
			}),
		]),
	}),
	permiso: { departamento: "calidad" },
});

/** Una opción de un selector. */
const opcion = z.object({ id: z.uuid().describe("Su id"), nombre: z.string().describe("Su texto") });

export const opcionesDeReclamo = definirConsulta({
	nombre: "calidad.opciones_reclamo",
	descripcion:
		"Las opciones de «Reclamo nuevo»: clientes, la prenda del código, sus lotes revisados, las notas entregadas, los defectos, las operaciones que los causan y quién las hizo",
	entrada: z.object({
		cliente_texto: z.string().trim().max(80).optional().describe("Lo que se escribió del cliente"),
		cliente_id: z.uuid().optional().describe("El cliente escogido, para sus notas de entrega"),
		codigo: z.string().trim().max(6).optional().describe("El código de la prenda"),
		defecto_id: z.uuid().optional().describe("El defecto escogido"),
		lote_id: z.uuid().optional().describe("El lote escogido"),
	}),
	salida: z.object({
		clientes: z.array(opcion).describe("Los clientes externos que coinciden, hasta 20"),
		prenda: z
			.object({ variante_id: z.uuid(), titulo: z.string().describe("«{prenda} · talla {t}»") })
			.nullable()
			.describe("La prenda y la talla del código; vacío si no es de ninguna"),
		lotes: z
			.array(opcion)
			.describe("Los lotes revisados de esa prenda, con su fecha de corte («L-2026-104 · cortado el 16 sep»)"),
		notas: z.array(opcion).describe("Las notas de entrega entregadas a ese cliente con esa prenda"),
		defectos: z.array(opcion).describe("El catálogo de defectos"),
		operaciones: z
			.array(opcion.extend({ persona_id: z.uuid().nullable().describe("Quién se propone") }))
			.describe(
				"Las operaciones del flujo del lote que suelen causar el defecto, cada una con la persona que se propone",
			),
		personas: z.array(opcion).describe("La gente del Taller"),
		min_letras: z.number().int().describe("`calidad.reclamo_min_letras`"),
	}),
	permiso: { departamento: "calidad" },
});
