/**
 * El PIN sin internet: la tablet calcula Argon2id con hash-wasm, con la sal y los parámetros que trae el hash de la
 * persona (descifrado solo para revisarlo), y lo compara. Cuenta los intentos por persona; un PIN correcto los regresa a
 * cero y uno equivocado suelto no sube. Al llegar a `personal.pin_intentos_bloqueo` la bloquea en ese momento y manda
 * `produccion.registrar_bloqueo_pin` por su cola; sigue bloqueada hasta que baje un desbloqueo posterior.
 * Fase 20 · docs/apps/tablet.md («El PIN sin internet») y docs/modulos/personal/pin-del-taller.md
 */

import { argon2Verify } from "hash-wasm";
import { encolar } from "../cola/cola.ts";
import type { BaseDeLaTablet, Renglon } from "../copia/base.ts";
import { parametroEntero } from "../copia/parametros.ts";
import { descifrar, esCifrado, llaveDeCifrado } from "../registro/cifrado.ts";

/** Lo que pasó al revisar un PIN. */
export type RevisionDePin =
	| { resultado: "entra" }
	| { resultado: "equivocado"; quedan: number }
	| { resultado: "bloqueado" };

/**
 * El PIN vigente de una persona: activo o bloqueado (el anulado no entra).
 * @param base La base local.
 * @param personaId La persona.
 */
export async function pinDe(base: BaseDeLaTablet, personaId: string): Promise<Renglon | undefined> {
	const suyos = await base.copia("pines").where("persona_id").equals(personaId).toArray();
	return suyos.find((pin) => pin.estado === "activo" || pin.estado === "bloqueado");
}

/**
 * Si la persona está bloqueada: por el servidor, o por la tablet sin un desbloqueo que haya bajado después.
 * @param base La base local.
 * @param pin Su PIN.
 */
export async function estaBloqueada(base: BaseDeLaTablet, pin: Renglon): Promise<boolean> {
	const personaId = String(pin.persona_id);
	const intentos = await base.intentos_pin.get(personaId);
	const desbloqueado = typeof pin.desbloqueado_en === "string" ? Date.parse(pin.desbloqueado_en) : null;
	if (intentos?.bloqueado_en !== undefined) {
		// Un desbloqueo de Personal posterior al bloqueo de la tablet la deja entrar otra vez, con los intentos en cero.
		if (desbloqueado === null || desbloqueado <= Date.parse(intentos.bloqueado_en)) return true;
		await base.intentos_pin.put({ persona_id: personaId, intentos: 0 });
		return pin.estado === "bloqueado";
	}
	return pin.estado === "bloqueado";
}

/**
 * Si un hash cifrado es el de un PIN.
 * @param base La base local.
 * @param hash El hash cifrado que bajó.
 * @param pin Las cuatro cifras.
 */
async function esSuPin(base: BaseDeLaTablet, hash: unknown, pin: string): Promise<boolean> {
	if (!esCifrado(hash)) return false;
	return argon2Verify({ password: pin, hash: await descifrar(await llaveDeCifrado(base), hash) });
}

/**
 * Revisa el PIN de una persona sin internet.
 * @param base La base local.
 * @param personaId La persona.
 * @param pin Las cuatro cifras que escribió.
 */
export async function revisarPin(base: BaseDeLaTablet, personaId: string, pin: string): Promise<RevisionDePin> {
	const suyo = await pinDe(base, personaId);
	if (suyo === undefined || (await estaBloqueada(base, suyo))) return { resultado: "bloqueado" };
	if (await esSuPin(base, suyo.pin_hash, pin)) {
		await base.intentos_pin.put({ persona_id: personaId, intentos: 0 });
		return { resultado: "entra" };
	}
	const maximo = await parametroEntero(base, "personal.pin_intentos_bloqueo");
	const intentos = ((await base.intentos_pin.get(personaId))?.intentos ?? 0) + 1;
	if (intentos < maximo) {
		await base.intentos_pin.put({ persona_id: personaId, intentos });
		return { resultado: "equivocado", quedan: maximo - intentos };
	}
	// Llegó al máximo: se bloquea en este momento y el bloqueo sube por la cola con su hora.
	const ahora = new Date().toISOString();
	await base.intentos_pin.put({ persona_id: personaId, intentos, bloqueado_en: ahora });
	await encolar(base, {
		accion: "produccion.registrar_bloqueo_pin",
		datos: { pin_id: suyo.id, intentos },
		persona_id: personaId,
		ocurrido_en: ahora,
	});
	return { resultado: "bloqueado" };
}
