/**
 * Los contratos de Por revisar: la lista de lotes que esperan revisión, los revisados hoy y los reprocesos en el
 * taller (`calidad.por_revisar`), y lo que necesita la revisión de un lote (`calidad.revision_lote`): sus tallas con
 * sus listas, el catálogo de defectos, las operaciones de su flujo, la gente del Taller y la operación y la persona que
 * se proponen para cada rechazo (regla 3 de docs/modulos/calidad/revision-de-lotes.md).
 * Fase 19 · docs/interfaz/fabrica/calidad.md («Por revisar» y «Revisión de un lote»)
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";
import { colorDeEstado } from "../estados.ts";
import { paraQuien } from "../produccion/pantallas.ts";

/** Un lote que espera revisión. */
export const loteParaRevisar = z.object({
	lote_id: z.uuid().describe("El lote"),
	folio: z.string().describe("Su folio («L-2026-121»)"),
	prenda: z.string().describe("La prenda"),
	linea: z.string().describe("«{L} · terminado el {fecha}»"),
	listas: z.number().int().describe("Las piezas listas: las que se revisan"),
	para: paraQuien,
	urgente: z.boolean().describe("Si es «Por revisar hoy» (`calidad.por_revisar_hoy_dias`)"),
});

/** Un lote revisado hoy. */
export const revisadoHoy = z.object({
	lote_id: z.uuid().describe("El lote"),
	folio: z.string().describe("Su folio"),
	prenda: z.string().describe("La prenda"),
	aprobadas: z.number().int().describe("Las aprobadas, que pasan a aduana"),
	a_reproceso: z.number().int().describe("Las que regresaron al taller"),
	reviso: z.string().describe("Quién revisó"),
	reviso_quien_coso: z.boolean().describe("Si la revisión quedó marcada: revisó quien cosió en el lote"),
});

/** Un reproceso en el taller. */
export const reprocesoEnElTaller = z.object({
	reproceso_id: z.uuid().describe("El reproceso"),
	version: z.number().int().describe("Su versión, para «Aprobar»"),
	prenda: z.string().describe("La prenda"),
	linea: z.string().describe("«{L}-R{n} · {PE} · {fecha}»"),
	defecto: z.string().describe("El defecto"),
	talla: z.string().describe("La talla"),
	persona: z.string().describe("A quién regresó"),
	operacion: z.string().describe("La operación que lo causó"),
	piezas: z.number().int().describe("Sus piezas"),
	estado: z.string().describe("«En reproceso» o «Aprobado»"),
	color: colorDeEstado,
	puede_aprobar: z.boolean().describe("Si sale «Aprobar» prendido: está en reproceso y Aduana ya recibió su lote"),
	motivo_apagado: z
		.string()
		.nullable()
		.describe("Por qué «Aprobar» sale apagado («Aduana todavía no recibe {L}: el reproceso se aprueba después.»)"),
});

export const porRevisarDeCalidad = definirConsulta({
	nombre: "calidad.por_revisar",
	descripcion:
		"Por revisar: los lotes terminados que esperan revisión, los revisados hoy y los reprocesos en el taller. Sin dinero",
	entrada: z.object({}),
	salida: z.object({
		lotes: z.array(loteParaRevisar).describe("Primero los «Por revisar hoy»; luego por entrega"),
		revisados_hoy: z.array(revisadoHoy).describe("Los revisados hoy, del más nuevo al más viejo"),
		reprocesos: z.array(reprocesoEnElTaller).describe("Los reprocesos en el taller y los aprobados hoy, por folio"),
	}),
	permiso: { departamento: "calidad" },
});

/** Una opción de un selector: su id y su texto. */
const opcion = z.object({ id: z.uuid().describe("Su id"), nombre: z.string().describe("Su nombre") });

export const revisionDeLote = definirConsulta({
	nombre: "calidad.revision_lote",
	descripcion:
		"La revisión de un lote: sus tallas con sus listas, los defectos, las operaciones de su flujo, la gente del Taller y lo que se propone para cada rechazo",
	entrada: z.object({ lote_id: z.uuid().describe("El lote") }),
	salida: z.object({
		lote_id: z.uuid().describe("El lote"),
		version: z.number().int().describe("Su versión, para «Aprobar»"),
		folio: z.string().describe("Su folio"),
		prenda: z.string().describe("La prenda"),
		para: paraQuien,
		por_revisar: z.boolean().describe("Si está terminado y se puede revisar"),
		tallas: z
			.array(
				z.object({
					variante_id: z.uuid().describe("La talla del lote"),
					talla: z.string().describe("Su nombre"),
					listas: z.number().int().describe("Sus piezas listas"),
				}),
			)
			.describe("Las tallas cortadas, en su orden"),
		defectos: z
			.array(opcion.extend({ flujo_operacion_id: z.uuid().describe("La operación que se propone") }))
			.describe("El catálogo de defectos, con la operación del flujo que se propone para cada uno"),
		operaciones: z.array(opcion).describe("Las operaciones del flujo de la prenda, en su orden"),
		personas: z.array(opcion).describe("La gente del Taller"),
		propuestas: z
			.array(
				z.object({
					flujo_operacion_id: z.uuid().describe("La operación"),
					variante_id: z.uuid().describe("La talla"),
					persona_id: z.uuid().describe("Quien hizo más piezas de esa operación en esa talla, o la de base"),
				}),
			)
			.describe("La persona que se propone por operación y talla"),
		revisa: z.string().describe("El nombre de la cuenta que revisa"),
		coso_en_el_lote: z.boolean().describe("Si la persona de la cuenta tiene registros vigentes en el lote"),
	}),
	permiso: { departamento: "calidad" },
	errores: [{ codigo: "no_existe", mensaje: "Ese lote no existe." }],
});
