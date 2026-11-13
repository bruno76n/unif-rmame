/**
 * Los contratos de la asistencia: capturar un día, cerrar la semana y reabrirla.
 * Fase 7 · docs/modulos/personal/asistencia.md («Acciones»)
 * Fase 19 · la consulta de Personal · Asistencia, con sus indicadores, sus pendientes, la cuadrícula de la semana y
 * las semanas cerradas (docs/interfaz/fabrica/personal.md, «Asistencia»)
 */

import { z } from "zod";
import { definirAccion, definirConsulta } from "../definir.ts";
import { colorDeEstado } from "../estados.ts";

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

/** Un estado ya escrito por la consulta, en su forma de la guía de textos, con su color: la pantalla solo lo pinta. */
export const estadoDePersonal = z.object({
	texto: z
		.string()
		.describe("El estado: «Por capturar», «Por cerrar», «Cerrada», «Sin PIN», «Bloqueado», «Sin tarifa»"),
	color: colorDeEstado,
});

/** Lo que hace el botón de un renglón de Pendientes, con lo que necesita su acción. */
export const botonDePendiente = z.discriminatedUnion("tipo", [
	z.object({
		tipo: z.literal("cerrar_semana"),
		asistencia_semana_id: z.uuid().nullable().describe("La semana; vacía si todavía no se abre en la base"),
		version: z.number().int().nullable().describe("Su versión, para cerrarla"),
		principal: z.boolean().describe("Negro: ya no hay días por capturar"),
	}),
	z.object({ tipo: z.literal("asignar_pin"), persona_id: z.uuid() }),
	z.object({
		tipo: z.literal("desbloquear_pin"),
		persona_id: z.uuid(),
		nombre: z.string(),
		version: z.number().int().describe("La versión de su PIN"),
	}),
	z.object({ tipo: z.literal("poner_tarifa"), flujo_id: z.uuid(), flujo_operacion_id: z.uuid() }),
]);

/** Los grupos de Pendientes de Personal, que son sus filtros. */
export const gruposDePendientesDePersonal = ["asistencia", "pin", "tarifas"] as const;

/** Un día de una persona en la cuadrícula. */
const diaDeLaCuadricula = z.object({
	fecha: z.iso.date(),
	valor: z.enum(valoresDeDia).nullable().describe("Lo capturado; vacío si está sin capturar"),
	version: z.number().int().nullable().describe("La versión del día, si ya estaba capturado"),
	capturable: z.boolean().describe("Falso fuera de su ingreso o su baja: sale gris, sin botón"),
});

/** Una semana de asistencia: sus días de trabajo y la gente que la lleva, con lo que falta. */
const semanaDeAsistencia = z.object({
	asistencia_semana_id: z.uuid().nullable().describe("Vacía si la semana todavía no se abre en la base"),
	inicio: z.iso.date(),
	fin: z.iso.date(),
	texto: z.string().describe("«9 al 14 de noviembre»"),
	cerrada: z.boolean(),
	version: z.number().int().nullable(),
	dias: z.array(z.object({ fecha: z.iso.date(), texto: z.string().describe("«lun 9»") })),
	personas: z.array(
		z.object({
			persona_id: z.uuid(),
			nombre: z.string(),
			detalle: z.string().describe("«{área} · {forma de pago}»"),
			dias: z.array(diaDeLaCuadricula),
			total: z.number().describe("Completo 1, medio 0.5; falta y sin capturar 0"),
		}),
	),
	sin_capturar: z.number().int().describe("Los días exigidos que faltan"),
	primero_sin_capturar: z
		.object({ persona_id: z.uuid(), fecha: z.iso.date() })
		.nullable()
		.describe("Donde se pone el foco si se quiere cerrar con días por capturar"),
	conteo: z.object({
		completos: z.number().int(),
		medios: z.number().int(),
		faltas: z.number().int(),
	}),
});

/** Personal · Asistencia: los indicadores, los pendientes, la cuadrícula de una semana y las semanas cerradas. */
export const asistenciaDePersonal = definirConsulta({
	nombre: "personal.asistencia",
	descripcion:
		"Personal · Asistencia: los indicadores, los pendientes (asistencia, PIN y, con el permiso, tarifas), la cuadrícula de la semana y las semanas cerradas",
	entrada: z.object({
		asistencia_semana_id: z
			.uuid()
			.optional()
			.describe("La semana de la cuadrícula; sin ella, la que corre (también la pasada mientras siga abierta)"),
	}),
	salida: z.object({
		indicadores: z.object({
			asistencia: z.object({
				sin_capturar: z.number().int(),
				cerrada: z.boolean(),
				personas: z.number().int().describe("Las que cobran por tiempo o mixta en la semana"),
				completos: z.number().int(),
				medios: z.number().int(),
				faltas: z.number().int(),
			}),
			personas: z.object({ activas: z.number().int(), sin_cuenta: z.number().int() }),
			tablet: z.object({
				sin_acceso: z.number().int().describe("Las del Taller sin cuenta ni PIN"),
				activos: z.number().int(),
				bloqueados: z.number().int(),
			}),
		}),
		pendientes: z.array(
			z.object({
				clave: z.string(),
				grupo: z.enum(gruposDePendientesDePersonal),
				tipo: z.enum(["Asistencia", "PIN", "Tarifa"]),
				referencia: z.string(),
				detalle: z.string(),
				fecha: z.string().nullable().describe("La que importa, para ordenar"),
				fecha_texto: z.string().nullable().describe("«Nómina 17 nov» o el día del bloqueo"),
				estado: estadoDePersonal,
				boton: botonDePendiente.nullable(),
			}),
		),
		pestanas: z
			.object({
				asistencia: z.number().int().describe("Los días sin capturar, o 1 por semana que solo falta cerrar"),
				tablet: z.number().int().describe("Las personas sin PIN y las bloqueadas"),
				tarifas: z.number().int().nullable().describe("Las operaciones sin tarifa; vacío sin el permiso"),
			})
			.describe("El conteo de cada pestaña"),
		semanas_abiertas: z
			.array(z.object({ asistencia_semana_id: z.uuid().nullable(), texto: z.string() }))
			.describe("Las semanas que se pueden escoger en la cuadrícula: la que corre y las anteriores abiertas"),
		semana: semanaDeAsistencia,
		semanas_cerradas: z.array(
			z.object({
				asistencia_semana_id: z.uuid(),
				texto: z.string(),
				la_cerro: z.string().nullable(),
				cuando: z.iso.date().nullable(),
				faltas: z.number().int(),
				version: z.number().int(),
				reabrible: z.boolean().describe("Solo para la dueña, mientras su nómina no esté pagada"),
			}),
		),
		ve_tarifas: z.boolean().describe("Si la cuenta tiene «ven sueldos y tarifas»"),
		pastilla: z.object({ conteo: z.number().int(), rojo: z.boolean() }).describe("La pastilla del menú"),
	}),
	permiso: { departamento: "personal" },
});
