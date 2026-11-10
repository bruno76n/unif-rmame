/**
 * Los contratos de la asistencia: capturar un día, cerrar la semana y reabrirla.
 * Fase 7 · docs/modulos/personal/asistencia.md («Acciones»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** El valor de un día: completo (1), medio (0.5) o falta (0). */
export const valoresDeDia = ["completo", "medio", "falta"] as const;

/** Personal marca un día de una persona; la pantalla manda el valor que queda. */
export const cambiarDiaAsistencia = definirAccion({
	nombre: "personal.cambiar_dia_asistencia",
	descripcion: "Marca un día de asistencia de una persona que cobra por tiempo o mixto",
	entrada: z.object({
		persona_id: z.uuid().describe("La persona"),
		fecha: z.iso.date().describe("El día"),
		valor: z.enum(valoresDeDia).describe("Completo, medio o falta"),
		version: z.number().int().nonnegative().optional().describe("La versión del día, si ya estaba capturado"),
	}),
	salida: z.object({
		asistencia_dia_id: z.uuid().describe("El día capturado"),
		version: z.number().int().describe("Su versión nueva"),
	}),
	permiso: { departamento: "personal" },
	errores: [
		{ codigo: "semana_cerrada", mensaje: "Esa semana ya está cerrada: la tiene contaduría" },
		{ codigo: "dia_no_laboral", mensaje: "Ese día no es día laboral" },
		{ codigo: "persona_sin_asistencia", mensaje: "Cobra por pieza: no lleva asistencia" },
		{ codigo: "antes_de_ingreso", mensaje: "Todavía no había entrado" },
		{ codigo: "despues_de_baja", mensaje: "Ya se había dado de baja" },
	],
});

/** Personal cierra la semana para que Contaduría pague la nómina. */
export const cerrarSemanaAsistencia = definirAccion({
	nombre: "personal.cerrar_semana_asistencia",
	descripcion: "Cierra la asistencia de la semana: sus días ya no cambian y contaduría puede pagar",
	entrada: z.object({ asistencia_semana_id: z.uuid().describe("La semana") }),
	salida: z.object({}),
	permiso: { departamento: "personal" },
	errores: [
		{ codigo: "dias_sin_capturar", mensaje: "Faltan días por capturar" },
		{ codigo: "semana_ya_cerrada", mensaje: "Esa semana ya está cerrada" },
		{ codigo: "semana_sin_terminar", mensaje: "La semana todavía no termina" },
	],
	edita: true,
});

/** La dueña reabre una semana cerrada, con motivo, si su nómina no se ha pagado. */
export const reabrirSemanaAsistencia = definirAccion({
	nombre: "personal.reabrir_semana_asistencia",
	descripcion: "Reabre la asistencia de una semana cerrada cuya nómina no se ha pagado",
	entrada: z.object({
		asistencia_semana_id: z.uuid().describe("La semana"),
		motivo: z.string("Escribe el motivo").trim().min(1, "Escribe el motivo").max(80).describe("Por qué"),
	}),
	salida: z.object({}),
	permiso: { departamento: "personal", soloDuena: true },
	errores: [
		{ codigo: "nomina_pagada", mensaje: "La nómina ya se pagó: la semana ya no se reabre. Corrige en la siguiente" },
		{ codigo: "semana_abierta", mensaje: "Esa semana está abierta" },
	],
	edita: true,
});
