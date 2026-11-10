/**
 * Lo que comparten las acciones del PIN del taller: generarlo, su hash Argon2id, el PIN vivo de una persona,
 * a quién le aplica y tocar a la persona para que baje a la tablet.
 * Fase 7 · docs/modulos/personal/pin-del-taller.md (reglas 1, 3 y 5, «Cómo se guarda»)
 */

import { argon2, randomBytes, randomInt } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { ubicaciones } from "../../inventario/tablas.ts";
import { type Persona, tieneCuenta } from "../dominio/personas.ts";
import { personas, pines } from "../tablas.ts";

/** Los parámetros de Argon2id: los mínimos de OWASP (19 MiB, 2 pasadas, 1 hilo), que la tablet calcula rápido. */
export const parametrosDeArgon2 = { memoria: 19_456, pasadas: 2, hilos: 1, largo: 32 } as const;

/** Argon2id con promesa. */
const argon2EnPromesa = promisify(argon2);

/** Un PIN de 4 cifras al azar, de un generador criptográfico. */
export function nuevoPin(): string {
	return String(randomInt(0, 10_000)).padStart(4, "0");
}

/**
 * El hash Argon2id de un PIN con su sal, en el formato PHC (`$argon2id$v=19$m=…,t=…,p=…$sal$hash`), que la
 * tablet revisa con hash-wasm.
 * @param pin El PIN en claro.
 */
export async function hashDePin(pin: string): Promise<string> {
	const sal = randomBytes(16);
	const { memoria, pasadas, hilos, largo } = parametrosDeArgon2;
	const hash = await argon2EnPromesa("argon2id", {
		message: pin,
		nonce: sal,
		memory: memoria,
		passes: pasadas,
		parallelism: hilos,
		tagLength: largo,
	});
	const enBase64 = (bytes: Buffer) => bytes.toString("base64").replace(/=+$/, "");
	return ["", "argon2id", "v=19", `m=${memoria},t=${pasadas},p=${hilos}`, enBase64(sal), enBase64(hash)].join("$");
}

/**
 * La ubicación donde vale el PIN: hoy, el Taller.
 * @param transaccion La transacción.
 */
export async function ubicacionDelPin(transaccion: Transaccion): Promise<string> {
	const [taller] = await transaccion
		.select({ id: ubicaciones.id })
		.from(ubicaciones)
		.where(eq(ubicaciones.tipo, "taller"));
	if (taller === undefined) throw new Error("no hay ubicación del Taller");
	return taller.id;
}

/** Un PIN como lo leen las acciones. */
export type Pin = typeof pines.$inferSelect;

/**
 * El PIN vivo (activo o bloqueado) de una persona en una ubicación, bloqueado para cambiarlo.
 * @param transaccion La transacción.
 * @param personaId La persona.
 * @param ubicacionId Dónde vale.
 */
export async function pinVivo(
	transaccion: Transaccion,
	personaId: string,
	ubicacionId: string,
): Promise<Pin | undefined> {
	const [vivo] = await transaccion
		.select()
		.from(pines)
		.where(
			and(
				eq(pines.personaId, personaId),
				eq(pines.ubicacionId, ubicacionId),
				inArray(pines.estado, ["activo", "bloqueado"]),
			),
		)
		.for("update");
	return vivo;
}

/**
 * Revisa que la persona pueda tener PIN: activa, del Taller y sin cuenta de Google.
 * @param transaccion La transacción.
 * @param persona La persona.
 * @throws `422 pin_no_aplica`.
 */
export async function revisarQueLeAplica(transaccion: Transaccion, persona: Persona): Promise<void> {
	if (persona.bajaEn !== null || persona.area !== "taller" || (await tieneCuenta(transaccion, persona.id))) {
		throw errorDeRegla("pin_no_aplica", "El PIN solo es para personas activas del Taller sin cuenta de Google.");
	}
}

/**
 * Toca el renglón de las personas para que bajen (o se quiten) en la tablet: su filtro depende de su PIN, que
 * vive en otra tabla (ver docs/cimientos/SINCRONIZACION.md, «Filtros que cambian sin tocar el renglón»).
 * @param transaccion La transacción.
 * @param personaIds Las personas.
 */
export async function tocarPersonas(transaccion: Transaccion, personaIds: readonly string[]): Promise<void> {
	if (personaIds.length === 0) return;
	await transaccion
		.update(personas)
		.set({ actualizadoEn: sql`now()` })
		.where(inArray(personas.id, [...personaIds]));
}

/**
 * El evento de un PIN: «hay cambios» en `personas` y `pines` para la tablet de su ubicación.
 * @param contexto El contexto de la acción.
 * @param tipo `pin.asignado`, `pin.restablecido`, `pin.desbloqueado`, `pin.anulado` o `pin.bloqueado`.
 * @param datos Los ids del evento.
 * @param ubicacionId Dónde vale.
 */
export function eventoDePin(
	contexto: ContextoDeAccion,
	tipo: `pin.${string}`,
	datos: Record<string, string | number>,
	ubicacionId: string,
): void {
	contexto.guardarEvento({ tipo, datos, tablas: ["personas", "pines"], ubicacionIds: [ubicacionId] });
}
