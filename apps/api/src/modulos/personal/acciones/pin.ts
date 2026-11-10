/**
 * `personal.asignar_pin`, `personal.restablecer_pin` y `personal.desbloquear_pin`: Personal da, cambia y
 * desbloquea el PIN del taller.
 * Fase 7 · docs/modulos/personal/pin-del-taller.md («Acciones»)
 *
 * El PIN son 4 cifras al azar y se entrega una sola vez: el contrato lo declara secreto, así que el reintento
 * recibe la respuesta sin él. En la base solo queda su hash Argon2id. La bitácora y los eventos llevan su
 * estado, nunca el PIN ni el hash. Cada cambio toca a la persona para que baje (o se quite) en la tablet.
 */

import { asignarPin, desbloquearPin, restablecerPin } from "@uniformame/compartido/contratos/personal/pines";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { leerPersona, type Persona } from "../dominio/personas.ts";
import {
	eventoDePin,
	hashDePin,
	nuevoPin,
	pinVivo,
	revisarQueLeAplica,
	tocarPersonas,
	ubicacionDelPin,
} from "../dominio/pines.ts";
import { pines } from "../tablas.ts";

/** La cuenta que hace el cambio, o nada si es el sistema. */
function quienCambia(contexto: ContextoDeAccion): string | null {
	return contexto.quien.tipo === "cuenta" ? contexto.quien.usuarioId : null;
}

/**
 * Da un PIN nuevo y activo a la persona, y la toca para que baje.
 * @returns El id del PIN y el PIN en claro.
 */
async function darPin(contexto: ContextoDeAccion, persona: Persona, ubicacionId: string) {
	const pin = nuevoPin();
	const id = uuidv7();
	await contexto.transaccion.insert(pines).values({
		id,
		personaId: persona.id,
		ubicacionId,
		pinHash: await hashDePin(pin),
		creadoPor: quienCambia(contexto),
	});
	await tocarPersonas(contexto.transaccion, [persona.id]);
	return { pin_id: id, pin };
}

export const accionAsignarPin = implementarAccion(asignarPin, async (contexto, datos) => {
	const { transaccion } = contexto;
	const persona = await leerPersona(transaccion, datos.persona_id);
	await revisarQueLeAplica(transaccion, persona);
	const ubicacionId = await ubicacionDelPin(transaccion);
	if ((await pinVivo(transaccion, persona.id, ubicacionId)) !== undefined) {
		throw errorDeRegla("ya_tiene_pin", `${persona.nombre} ya tiene PIN. Usa «Restablecer».`);
	}
	const nuevo = await darPin(contexto, persona, ubicacionId);
	contexto.bitacora({
		descripcion: `Asignó el PIN del taller de ${persona.nombre}`,
		entidad: "personas",
		entidadId: persona.id,
		entidadFolio: persona.folio,
		despues: { estado: "activo" },
	});
	eventoDePin(contexto, "pin.asignado", { persona_id: persona.id, pin_id: nuevo.pin_id }, ubicacionId);
	return {
		resultado: { ...nuevo, mensaje: "Se muestra una sola vez: dáselo en persona." },
		entidad: { nombre: "pines", id: nuevo.pin_id },
	};
});

export const accionRestablecerPin = implementarAccion(restablecerPin, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const persona = await leerPersona(transaccion, datos.persona_id);
	const ubicacionId = await ubicacionDelPin(transaccion);
	const vivo = await pinVivo(transaccion, persona.id, ubicacionId);
	if (vivo === undefined) throw errorDeRegla("sin_pin", `${persona.nombre} no tiene PIN. Usa «Asignar PIN».`);
	await revisarQueLeAplica(transaccion, persona);
	await tomarVersion(contexto, pines, vivo.id, version, async () => ({ persona_id: persona.id }));
	await transaccion
		.update(pines)
		.set({
			estado: "anulado",
			anuladoEn: contexto.ahora.toString(),
			anuladoPor: quienCambia(contexto),
			motivoAnulacion: "restablecido",
		})
		.where(eq(pines.id, vivo.id));
	const nuevo = await darPin(contexto, persona, ubicacionId);
	contexto.bitacora({
		descripcion: `Restableció el PIN del taller de ${persona.nombre}`,
		entidad: "personas",
		entidadId: persona.id,
		entidadFolio: persona.folio,
		antes: { estado: vivo.estado },
		despues: { estado: "activo" },
	});
	eventoDePin(contexto, "pin.restablecido", { persona_id: persona.id, pin_id: nuevo.pin_id }, ubicacionId);
	return {
		resultado: {
			...nuevo,
			mensaje: "El anterior ya no entra.",
			version: await versionActual(transaccion, pines, nuevo.pin_id),
		},
		entidad: { nombre: "pines", id: nuevo.pin_id },
	};
});

export const accionDesbloquearPin = implementarAccion(desbloquearPin, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const persona = await leerPersona(transaccion, datos.persona_id);
	const ubicacionId = await ubicacionDelPin(transaccion);
	const vivo = await pinVivo(transaccion, persona.id, ubicacionId);
	if (vivo?.estado !== "bloqueado") {
		throw errorDeRegla("no_esta_bloqueado", `${persona.nombre} no está bloqueada.`);
	}
	await tomarVersion(contexto, pines, vivo.id, version, async () => ({ persona_id: persona.id }));
	await transaccion
		.update(pines)
		.set({
			estado: "activo",
			intentosFallidos: 0,
			desbloqueadoEn: contexto.ahora.toString(),
			desbloqueadoPor: quienCambia(contexto),
		})
		.where(eq(pines.id, vivo.id));
	contexto.bitacora({
		descripcion: `Desbloqueó el PIN del taller de ${persona.nombre}`,
		entidad: "personas",
		entidadId: persona.id,
		entidadFolio: persona.folio,
		antes: { estado: "bloqueado" },
		despues: { estado: "activo" },
	});
	eventoDePin(contexto, "pin.desbloqueado", { persona_id: persona.id, pin_id: vivo.id }, ubicacionId);
	return {
		resultado: {
			mensaje: `${persona.nombre} ya puede entrar con su PIN`,
			version: await versionActual(transaccion, pines, vivo.id),
		},
		entidad: { nombre: "pines", id: vivo.id },
	};
});
