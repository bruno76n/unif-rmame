/**
 * Quién llama con la llave de un aparato: `Authorization: Llave {llave_id}.{secreto}`.
 * Fase 6 · docs/cimientos/ACCESO-Y-PERMISOS.md («Las formas de entrar») y docs/modulos/admin/dispositivos.md
 *
 * El servidor guarda solo el SHA-256 del secreto y lo compara en tiempo constante. Durante la gracia de
 * una rotación vale también la llave anterior; la primera llamada con la nueva acaba la gracia. Un aparato
 * revocado recibe `401 llave_revocada` en todo, menos en la subida, que lo deja pasar para no perder su
 * cola. Cada llamada anota el contacto del aparato a lo más una vez por minuto.
 */

import { timingSafeEqual } from "node:crypto";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { Temporal } from "temporal-polyfill";
import { dispositivos, dispositivosSync } from "../../modulos/admin/tablas.ts";
import type { Base } from "../base/conexion.ts";
import { ErrorDeApi } from "../http/errores.ts";
import { hashDe } from "./cookies.ts";
import type { AparatoQueLlama } from "./quien.ts";

/** El encabezado de la llave: `Llave {llave_id}.{secreto}`. */
const formaDeLaLlave = /^Llave ([a-z0-9]{6,16})\.([A-Za-z0-9_-]{43})$/;

/** El tipo de aparato que llama con su llave, por el tipo de su registro. */
const tipoQueLlama: Readonly<Record<string, AparatoQueLlama["tipoDeAparato"]>> = {
	tablet_taller: "tablet",
	puente_impresion: "puente",
};

/** Un aparato que entró con su llave. */
export interface AparatoConLlave {
	quien: AparatoQueLlama;
	nombre: string;
	/** Cuándo se revocó, si se revocó. */
	revocadoEn: string | undefined;
}

/**
 * Dice si un encabezado trae una llave de aparato.
 * @param autorizacion El encabezado `Authorization`.
 */
export function traeLlave(autorizacion: string | undefined): boolean {
	return autorizacion?.startsWith("Llave ") === true;
}

/**
 * Compara dos hashes en tiempo constante.
 * @param uno Un hash en hex.
 * @param otro Otro hash en hex.
 */
function mismoHash(uno: string, otro: string): boolean {
	const a = Buffer.from(uno, "hex");
	const b = Buffer.from(otro, "hex");
	return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Identifica al aparato de la llave.
 * @param base La base.
 * @param peticion La petición, por su `Authorization`, su IP, su `X-App-Version` y su `X-Pendientes`.
 * @param ahora La hora de la llamada.
 * @param opciones `permitirRevocado` (la subida) y `sinActividad` (la conexión en vivo que se revisa sola).
 * @returns El aparato, o `undefined` si no trae llave.
 * @throws `401 sin_sesion` con `llave_invalida` si la llave no existe o no coincide, o `llave_revocada`.
 */
export async function identificarConLlave(
	base: Base,
	peticion: FastifyRequest,
	ahora: Temporal.Instant,
	opciones: { permitirRevocado?: true; sinActividad?: true } = {},
): Promise<AparatoConLlave | undefined> {
	const autorizacion = peticion.headers.authorization;
	if (!traeLlave(autorizacion)) return undefined;
	const partes = formaDeLaLlave.exec(autorizacion ?? "");
	const invalida = new ErrorDeApi("sin_sesion", "llave_invalida");
	if (partes === null) throw invalida;
	const [, llaveId, secreto] = partes;
	const [aparato] = await base
		.select()
		.from(dispositivos)
		.where(eq(dispositivos.llaveId, llaveId ?? ""));
	const tipoDeAparato = aparato === undefined ? undefined : tipoQueLlama[aparato.tipo];
	if (aparato === undefined || tipoDeAparato === undefined) throw invalida;
	const hash = hashDe(secreto ?? "");
	const conLaNueva = mismoHash(hash, aparato.llaveHash);
	const enGracia =
		aparato.llaveAnteriorHash !== null &&
		aparato.llaveAnteriorVenceEn !== null &&
		Temporal.Instant.compare(Temporal.Instant.from(aparato.llaveAnteriorVenceEn), ahora) > 0;
	const conLaAnterior = !conLaNueva && enGracia && mismoHash(hash, aparato.llaveAnteriorHash ?? "");
	if (!conLaNueva && !conLaAnterior) throw invalida;
	if (aparato.bajaEn !== null && opciones.permitirRevocado !== true) {
		throw new ErrorDeApi("sin_sesion", "llave_revocada", "Este aparato fue revocado: ya no entra.");
	}
	// La primera llamada con la llave nueva acaba la gracia de la anterior.
	if (conLaNueva && aparato.llaveAnteriorHash !== null && opciones.sinActividad !== true) {
		await base
			.update(dispositivos)
			.set({ llaveAnteriorHash: null, llaveAnteriorVenceEn: null })
			.where(eq(dispositivos.id, aparato.id));
	}
	if (opciones.sinActividad !== true) await anotarContacto(base, aparato.id, peticion, ahora, false);
	return {
		quien: { tipo: "aparato", dispositivoId: aparato.id, tipoDeAparato, personaId: undefined },
		nombre: aparato.nombre,
		revocadoEn: aparato.bajaEn ?? undefined,
	};
}

/**
 * Anota el contacto de un aparato: la hora, la IP, la versión de su programa y lo que dice tener sin subir.
 * @param base La base.
 * @param dispositivoId El aparato.
 * @param peticion La petición, por su IP y sus encabezados.
 * @param ahora La hora.
 * @param siempre Subir y bajar lo anotan siempre; lo demás, a lo más una vez por minuto.
 */
export async function anotarContacto(
	base: Base,
	dispositivoId: string,
	peticion: FastifyRequest,
	ahora: Temporal.Instant,
	siempre: boolean,
): Promise<void> {
	const version = peticion.headers["x-app-version"];
	const pendientes = Number(peticion.headers["x-pendientes"]);
	const haceUnMinuto = ahora.subtract({ minutes: 1 }).toString();
	await base
		.update(dispositivosSync)
		.set({
			ultimoContactoEn: ahora.toString(),
			ip: peticion.ip,
			...(typeof version === "string" ? { versionApp: version.slice(0, 20) } : {}),
			...(Number.isInteger(pendientes) && pendientes >= 0 ? { pendientesPorSubir: pendientes } : {}),
			actualizadoEn: sql`now()`,
		})
		.where(
			and(
				eq(dispositivosSync.dispositivoId, dispositivoId),
				siempre
					? undefined
					: or(isNull(dispositivosSync.ultimoContactoEn), lt(dispositivosSync.ultimoContactoEn, haceUnMinuto)),
			),
		);
}
