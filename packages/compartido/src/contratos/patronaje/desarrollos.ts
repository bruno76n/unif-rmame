/**
 * Los contratos del desarrollo de un producto nuevo (DS-): la solicitud, la muestra, los cambios, la aprobación del
 * cliente y el descarte.
 * Fase 10 · docs/modulos/patronaje/desarrollos.md («Acciones»)
 *
 * La aprobación sin escuela la decide Dirección en sus autorizaciones (`aprobar_desarrollo`), y el alta en catálogo
 * la hace Catálogo: no son acciones de este contrato.
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** Las etapas de un desarrollo. */
export const etapasDeDesarrollo = [
	"solicitud",
	"muestra",
	"aprobacion",
	"ficha_tecnica",
	"en_catalogo",
	"cancelado",
] as const;

/** El paso que ya no aplica en esta etapa. */
const etapaNoPermite = { codigo: "etapa_no_permite", mensaje: "Ese desarrollo ya no está en esa etapa." } as const;

/** El motivo de un cambio o un descarte. */
const motivo = z.string().trim().max(200).describe("Por qué, al menos `general.largo_minimo_motivo` letras");

/** Patronaje registra lo que pidieron. */
export const registrarSolicitud = definirAccion({
	nombre: "patronaje.registrar_solicitud",
	descripcion: "Registra la solicitud de un producto nuevo, con su folio DS-",
	entrada: z.object({
		escuela_id: z
			.uuid()
			.nullable()
			.describe("La escuela; vacío: «Ninguna escuela: básico o general» (aprueba Dirección)"),
		prenda: z
			.string("Escribe qué prenda piden")
			.trim()
			.min(4, "Escribe qué prenda piden")
			.max(60, "Escribe qué prenda piden")
			.describe("Qué prenda piden"),
		tela_material_id: z.uuid("Escoge una tela.").describe("La tela de la solicitud, de Compras"),
		tallas: z
			.string("Escribe las tallas, por ejemplo 6 a 14")
			.trim()
			.min(1, "Escribe las tallas, por ejemplo 6 a 14")
			.max(30, "Escribe las tallas, por ejemplo 6 a 14")
			.describe("Libre: «6 a 14»"),
		descripcion: z.string().trim().max(200).optional().describe("«Qué pidieron»"),
	}),
	salida: z.object({ desarrollo_id: z.uuid().describe("El desarrollo"), folio: z.string().describe("Su folio DS-") }),
	permiso: { departamento: "patronaje" },
	errores: [
		{ codigo: "tela_no_es_tela", mensaje: "Escoge una tela." },
		{ codigo: "escuela_dada_de_baja", mensaje: "Esa escuela está dada de baja." },
	],
});

/** Patronaje empieza la muestra. */
export const empezarMuestra = definirAccion({
	nombre: "patronaje.empezar_muestra",
	descripcion: "Empieza la muestra de un desarrollo",
	entrada: z.object({
		desarrollo_id: z.uuid().describe("El desarrollo"),
		muestra_talla: z.string().trim().min(1).max(10).optional().describe("La talla de la muestra («M»)"),
	}),
	salida: z.object({}),
	permiso: { departamento: "patronaje" },
	errores: [etapaNoPermite],
	edita: true,
});

/** Patronaje entrega la muestra al cliente o, sin escuela, la deja lista para que Dirección la apruebe. */
export const entregarMuestra = definirAccion({
	nombre: "patronaje.entregar_muestra",
	descripcion: "Entrega la muestra al cliente, o la deja lista para que Dirección la apruebe",
	entrada: z.object({ desarrollo_id: z.uuid().describe("El desarrollo") }),
	salida: z.object({ autorizacion_id: z.uuid().nullable().describe("La AU- que nació, sin escuela") }),
	permiso: { departamento: "patronaje" },
	errores: [etapaNoPermite],
	edita: true,
});

/** Patronaje regresa la muestra con los cambios que pidieron. */
export const pedirCambiosMuestra = definirAccion({
	nombre: "patronaje.pedir_cambios_muestra",
	descripcion: "Regresa la muestra con los cambios que pidieron",
	entrada: z.object({ desarrollo_id: z.uuid().describe("El desarrollo"), motivo }),
	salida: z.object({}),
	permiso: { departamento: "patronaje" },
	errores: [etapaNoPermite],
	edita: true,
});

/** Patronaje registra que el cliente aprobó la muestra. */
export const registrarAprobacionCliente = definirAccion({
	nombre: "patronaje.registrar_aprobacion_cliente",
	descripcion: "Registra que el cliente aprobó la muestra; sin escuela, la aprueba Dirección",
	entrada: z.object({ desarrollo_id: z.uuid().describe("El desarrollo") }),
	salida: z.object({}),
	permiso: { departamento: "patronaje" },
	errores: [etapaNoPermite, { codigo: "aprueba_direccion", mensaje: "Sin escuela la aprueba Dirección." }],
	edita: true,
});

/** Patronaje descarta un desarrollo, con motivo. */
export const descartarDesarrollo = definirAccion({
	nombre: "patronaje.descartar_desarrollo",
	descripcion: "Descarta un desarrollo en cualquier etapa menos en catálogo; queda en el historial",
	entrada: z.object({ desarrollo_id: z.uuid().describe("El desarrollo"), motivo }),
	salida: z.object({}),
	permiso: { departamento: "patronaje" },
	errores: [{ codigo: "desarrollo_terminado", mensaje: "Ese desarrollo ya está en catálogo o descartado." }],
	edita: true,
});
