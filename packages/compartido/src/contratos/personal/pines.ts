/**
 * Los contratos del PIN del taller: asignarlo, restablecerlo y desbloquearlo.
 * Fase 7 · docs/modulos/personal/pin-del-taller.md («Acciones»)
 *
 * El PIN es un secreto: se entrega una sola vez y la respuesta guardada para los reintentos va sin él.
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** Lo que regresa dar un PIN: el PIN en claro, solo la primera vez. */
const pinNuevo = z.object({
	pin_id: z.uuid().describe("El PIN"),
	pin: z
		.string()
		.regex(/^\d{4}$/)
		.optional()
		.describe("El PIN en claro: solo en la primera respuesta"),
});

/** Los errores de un PIN que no aplica. */
const pinNoAplica = {
	codigo: "pin_no_aplica",
	mensaje: "El PIN solo es para personas activas del Taller sin cuenta de Google.",
} as const;

/** Personal le da su primer PIN a una persona del Taller. */
export const asignarPin = definirAccion({
	nombre: "personal.asignar_pin",
	descripcion: "Le da a una persona del Taller su PIN de la tablet; se muestra una sola vez",
	entrada: z.object({ persona_id: z.uuid().describe("La persona") }),
	salida: pinNuevo,
	permiso: { departamento: "personal" },
	errores: [pinNoAplica, { codigo: "ya_tiene_pin", mensaje: "Ya tiene PIN. Usa «Restablecer»." }],
	secretos: ["pin"],
});

/** Personal le da un PIN nuevo: el anterior ya no entra. */
export const restablecerPin = definirAccion({
	nombre: "personal.restablecer_pin",
	descripcion: "Le da un PIN nuevo a una persona del Taller; el anterior ya no entra",
	entrada: z.object({ persona_id: z.uuid().describe("La persona") }),
	salida: pinNuevo,
	permiso: { departamento: "personal" },
	errores: [pinNoAplica, { codigo: "sin_pin", mensaje: "No tiene PIN. Usa «Asignar PIN»." }],
	secretos: ["pin"],
	edita: true,
});

/** Personal desbloquea a quien se bloqueó en la tablet. */
export const desbloquearPin = definirAccion({
	nombre: "personal.desbloquear_pin",
	descripcion: "Desbloquea el PIN de una persona que se bloqueó en la tablet",
	entrada: z.object({ persona_id: z.uuid().describe("La persona") }),
	salida: z.object({}),
	permiso: { departamento: "personal" },
	errores: [{ codigo: "no_esta_bloqueado", mensaje: "No está bloqueada." }],
	edita: true,
});
