/**
 * `admin.guardar_evento`: anota un evento en la bandeja de salida y encola su proceso.
 * Fase 4 · docs/cimientos/EVENTOS-Y-TRABAJOS.md («`admin.guardar_evento` · interna»)
 *
 * Escribe en `eventos` y encola `procesar_eventos` con clave fija en la misma transacción: si la acción
 * no confirma, no queda ni el evento ni la tarea; si confirma, una sola tarea pendiente procesa todo lo
 * nuevo. Un evento nunca lleva montos, sueldos ni secretos: si los trae es un error del programa.
 */

import { pareceSecreto } from "@uniformame/compartido/contratos/definir";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import type { ContextoDeAccion, QuienEscribe } from "../../../nucleo/modulos.ts";
import { encolar } from "../../../nucleo/trabajos/encolar.ts";
import { eventos } from "../tablas.ts";

/** Lo que recibe: el evento, del módulo que lo guarda. */
export const eventoAGuardar = z.object({
	tipo: z.string().regex(/^[a-z_]+\.[a-z_]+$/),
	modulo: z.string().min(1),
	entidad: z.string().optional(),
	entidadId: z.uuid().optional(),
	entidadFolio: z.string().optional(),
	datos: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
	tablas: z.array(z.string()).min(1),
	ubicacionIds: z.array(z.uuid()).optional(),
});

/** Los nombres de campo que dicen dinero: un evento nunca los lleva. */
const nombresDeMonto =
	/(^|_)(centavos|monto|montos|precio|precios|sueldo|sueldos|tarifa|tarifas|importe|saldo|costo)(_|$)/;

/**
 * Dice si el nombre de un campo es de un monto, un sueldo o una tarifa.
 * @param campo El nombre del campo.
 */
export function pareceMonto(campo: string): boolean {
	return nombresDeMonto.test(campo);
}

/** Quién provocó el evento, en las columnas de `eventos`. */
function columnasDeQuien(quien: QuienEscribe) {
	return {
		usuarioId: quien.tipo === "cuenta" ? quien.usuarioId : null,
		personaId: quien.tipo === "aparato" ? (quien.personaId ?? null) : null,
		dispositivoId: quien.tipo === "aparato" ? quien.dispositivoId : null,
	};
}

/**
 * Guarda un evento en la transacción de la acción y encola su proceso.
 * @param contexto El contexto de la acción.
 * @param datos El evento (`eventoAGuardar`).
 * @returns `evento_id`.
 * @throws Error (un `500`) si los datos del evento traen montos o secretos.
 */
export async function guardarEvento(contexto: ContextoDeAccion, datos: unknown): Promise<{ evento_id: string }> {
	const evento = eventoAGuardar.parse(datos);
	const prohibido = Object.keys(evento.datos).find((campo) => pareceMonto(campo) || pareceSecreto(campo));
	if (prohibido !== undefined) throw new Error(`el evento ${evento.tipo} trae ${prohibido}: nunca montos ni secretos`);
	const id = uuidv7();
	await contexto.transaccion.insert(eventos).values({
		id,
		tipo: evento.tipo,
		modulo: evento.modulo,
		entidad: evento.entidad ?? null,
		entidadId: evento.entidadId ?? null,
		entidadFolio: evento.entidadFolio ?? null,
		datos: evento.datos,
		tablas: evento.tablas,
		ubicacionIds: evento.ubicacionIds ?? [],
		...columnasDeQuien(contexto.quien),
		comandoId: contexto.comandoId ?? null,
		ocurridoEn: contexto.ahora.toString(),
	});
	await encolar(contexto.transaccion, {
		tarea: "procesar_eventos",
		cola: "procesar_eventos",
		clave: "procesar_eventos",
	});
	return { evento_id: id };
}
