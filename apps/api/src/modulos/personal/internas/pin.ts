/**
 * Las internas del PIN del taller: `personal.anular_pin`, `personal.anular_pines_ubicacion` y
 * `personal.bloquear_pin`.
 * Fase 7 · docs/modulos/personal/pin-del-taller.md («Acciones internas», reglas 4 a 6)
 *
 * Anular toca a la persona para que se quite de la tablet; el PIN anulado también baja, para que deje de
 * entrar en cuanto la tablet sincroniza. Un bloqueo que llega de la tablet después de que Personal desbloqueó
 * no vuelve a bloquear.
 */

import { and, eq, inArray } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { eventoDePin, pinVivo, tocarPersonas, ubicacionDelPin } from "../dominio/pines.ts";
import { pines } from "../tablas.ts";

/** Por qué se anula un PIN. */
const motivos = z.enum(["restablecido", "baja_persona", "cuenta_google", "cambio_area"]);

/** Lo que recibe `personal.anular_pin`. */
const paraAnular = z.object({
	persona_id: z.uuid(),
	motivo: motivos,
	anulado_por: z.uuid().nullable().optional(),
});

/**
 * Anula el PIN vivo de una persona. Sin PIN vivo, no hace nada.
 * @param contexto El contexto de quien llama.
 * @param datos `persona_id`, `motivo` y `anulado_por` (vacío si es el sistema).
 * @returns `anulado`: si había uno vivo.
 */
export async function anularPin(contexto: ContextoDeAccion, datos: unknown) {
	const pedido = paraAnular.parse(datos);
	const { transaccion } = contexto;
	const ubicacionId = await ubicacionDelPin(transaccion);
	const vivo = await pinVivo(transaccion, pedido.persona_id, ubicacionId);
	if (vivo === undefined) return { anulado: false };
	await transaccion
		.update(pines)
		.set({
			estado: "anulado",
			anuladoEn: contexto.ahora.toString(),
			anuladoPor: pedido.anulado_por ?? null,
			motivoAnulacion: pedido.motivo,
		})
		.where(eq(pines.id, vivo.id));
	await tocarPersonas(transaccion, [pedido.persona_id]);
	eventoDePin(contexto, "pin.anulado", { persona_id: pedido.persona_id, pin_id: vivo.id }, ubicacionId);
	return { anulado: true };
}

/** Lo que recibe `personal.anular_pines_ubicacion`. */
const paraAnularTodos = z.object({ ubicacion_id: z.uuid(), anulado_por: z.uuid().nullable().optional() });

/**
 * Anula todos los PIN vivos de una ubicación (la tablet perdida): las personas quedan «Sin PIN».
 * @param contexto El contexto de quien llama.
 * @param datos `ubicacion_id` y `anulado_por`.
 * @returns `anulados`: cuántos.
 */
export async function anularPinesUbicacion(contexto: ContextoDeAccion, datos: unknown) {
	const pedido = paraAnularTodos.parse(datos);
	const { transaccion } = contexto;
	const anulados = await transaccion
		.update(pines)
		.set({
			estado: "anulado",
			anuladoEn: contexto.ahora.toString(),
			anuladoPor: pedido.anulado_por ?? null,
			motivoAnulacion: "restablecido",
		})
		.where(and(eq(pines.ubicacionId, pedido.ubicacion_id), inArray(pines.estado, ["activo", "bloqueado"])))
		.returning({ personaId: pines.personaId });
	await tocarPersonas(
		transaccion,
		anulados.map((pin) => pin.personaId),
	);
	if (anulados.length > 0) {
		eventoDePin(
			contexto,
			"pin.anulado",
			{ ubicacion_id: pedido.ubicacion_id, cuantos: anulados.length },
			pedido.ubicacion_id,
		);
	}
	return { anulados: anulados.length };
}

/** Lo que recibe `personal.bloquear_pin`: lo que mandó la tablet. */
const paraBloquear = z.object({
	pin_id: z.uuid(),
	persona_id: z.uuid(),
	intentos: z.number().int().positive(),
	ocurrido_en: z.iso.datetime({ offset: true }),
	dispositivo_id: z.uuid(),
});

/**
 * Bloquea el PIN que la tablet bloqueó a los intentos equivocados. No cambia nada si el PIN ya no está activo,
 * o si Personal lo desbloqueó después de que pasó el bloqueo.
 * @param contexto El contexto del comando de la tablet.
 * @param datos El PIN, la persona, los intentos, cuándo pasó y la tablet.
 * @returns `estado`: el del PIN.
 */
export async function bloquearPin(contexto: ContextoDeAccion, datos: unknown) {
	const pedido = paraBloquear.parse(datos);
	const { transaccion } = contexto;
	const [pin] = await transaccion
		.select()
		.from(pines)
		.where(and(eq(pines.id, pedido.pin_id), eq(pines.personaId, pedido.persona_id)))
		.for("update");
	if (pin === undefined) return { estado: "anulado" };
	const ocurrido = Temporal.Instant.from(pedido.ocurrido_en);
	const desbloqueadoDespues =
		pin.desbloqueadoEn !== null &&
		Temporal.Instant.compare(Temporal.Instant.from(new Date(pin.desbloqueadoEn).toISOString()), ocurrido) > 0;
	if (pin.estado !== "activo" || desbloqueadoDespues) return { estado: pin.estado };
	await transaccion
		.update(pines)
		.set({ estado: "bloqueado", bloqueadoEn: pedido.ocurrido_en, intentosFallidos: pedido.intentos })
		.where(eq(pines.id, pin.id));
	eventoDePin(
		contexto,
		"pin.bloqueado",
		{ persona_id: pedido.persona_id, pin_id: pin.id, intentos: pedido.intentos, dispositivo_id: pedido.dispositivo_id },
		pin.ubicacionId,
	);
	return { estado: "bloqueado" };
}
