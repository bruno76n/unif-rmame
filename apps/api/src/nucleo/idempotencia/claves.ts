/**
 * La clave de idempotencia: apartarla al empezar la transacción, la huella del contenido y la respuesta guardada.
 * Fase 3 · docs/cimientos/IDEMPOTENCIA-Y-CONCURRENCIA.md («La clave de idempotencia»)
 *
 * La clave se aparta con `INSERT … ON CONFLICT DO NOTHING` en la transacción de la acción: si otra
 * transacción la apartó y no ha terminado, Postgres hace esperar a esta en el índice único; cuando la
 * otra confirma, esta ve la clave ocupada y lee su respuesta. Si la otra falla, esta la aparta.
 */

import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { comandosRecibidos } from "../../modulos/admin/tablas.ts";
import type { QuienLlama } from "../acceso/quien.ts";
import type { Transaccion } from "../base/transacciones.ts";

/**
 * Escribe un valor JSON con las llaves de cada objeto en orden, para que el mismo contenido dé la misma huella.
 * @param valor Lo que se compara.
 */
function jsonOrdenado(valor: unknown): string {
	if (Array.isArray(valor)) return `[${valor.map(jsonOrdenado).join(",")}]`;
	if (typeof valor === "object" && valor !== null) {
		const pares = Object.entries(valor)
			.filter(([, v]) => v !== undefined)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
		return `{${pares.map(([llave, v]) => `${JSON.stringify(llave)}:${jsonOrdenado(v)}`).join(",")}}`;
	}
	return JSON.stringify(valor) ?? "null";
}

/**
 * La huella del contenido de una acción: el SHA-256 de su nombre, sus datos y su versión, con las llaves en orden.
 * @returns La huella en hexadecimal.
 */
export function huellaDeCarga(accion: string, datos: unknown, version: number | undefined): string {
	return createHash("sha256").update(jsonOrdenado({ accion, datos, version })).digest("hex");
}

/** Lo que pasó al apartar la clave. */
export type ClaveApartada =
	| { nueva: true }
	| { nueva: false; cargaHash: string; respuesta: unknown; usuarioId: string | null };

/**
 * Aparta la clave de una acción en su transacción.
 * @param transaccion La transacción de la acción.
 * @param comando El id del comando, la clave, quién llama, la acción, la hora y la huella.
 * @returns Si es nueva, o la huella y la respuesta de la vez anterior.
 */
export async function apartarClave(
	transaccion: Transaccion,
	comando: { id: string; clave: string; quien: QuienLlama; accion: string; ocurridoEn: string; cargaHash: string },
): Promise<ClaveApartada> {
	const { quien } = comando;
	const apartada = await transaccion
		.insert(comandosRecibidos)
		.values({
			id: comando.id,
			claveIdempotencia: comando.clave,
			origen: quien.tipo === "cuenta" ? "web" : "aparato",
			usuarioId: quien.tipo === "cuenta" ? quien.usuarioId : null,
			sesionId: quien.tipo === "cuenta" ? quien.sesionId : null,
			dispositivoId: quien.tipo === "aparato" ? quien.dispositivoId : null,
			personaId: quien.tipo === "aparato" ? (quien.personaId ?? null) : null,
			tipoComando: comando.accion,
			ocurridoEn: comando.ocurridoEn,
			cargaHash: comando.cargaHash,
			resultado: "aplicado",
		})
		.onConflictDoNothing({ target: comandosRecibidos.claveIdempotencia })
		.returning({ id: comandosRecibidos.id });
	if (apartada.length > 0) return { nueva: true };
	const [anterior] = await transaccion
		.select({
			cargaHash: comandosRecibidos.cargaHash,
			respuesta: comandosRecibidos.respuesta,
			usuarioId: comandosRecibidos.usuarioId,
		})
		.from(comandosRecibidos)
		.where(eq(comandosRecibidos.claveIdempotencia, comando.clave));
	if (anterior === undefined) throw new Error("la clave quedó apartada pero no se encontró");
	return { nueva: false, ...anterior };
}

/**
 * Guarda lo que se contestó, sin secretos, y el documento que se tocó.
 * @param transaccion La transacción de la acción.
 * @param id El id del comando.
 * @param respuesta La respuesta ya sin secretos.
 * @param entidad El documento que creó o tocó, si lo hay.
 */
export async function guardarRespuesta(
	transaccion: Transaccion,
	id: string,
	respuesta: unknown,
	entidad: { nombre: string; id: string } | undefined,
): Promise<void> {
	await transaccion
		.update(comandosRecibidos)
		.set({
			respuesta,
			entidad: entidad?.nombre ?? null,
			entidadId: entidad?.id ?? null,
			actualizadoEn: sql`now()`,
		})
		.where(eq(comandosRecibidos.id, id));
}

/** Escapa un texto para buscarlo tal cual dentro de una expresión regular. */
function literal(texto: string): string {
	return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Dice si un secreto va escrito en un texto para personas: como palabra suelta, no pegado a letras,
 * números ni guiones (así un PIN `4821` no se confunde con el folio `PE-4821` ni con un pedazo de un id).
 * @param texto El mensaje o un aviso.
 * @param secreto El valor del secreto.
 */
function llevaElSecreto(texto: string, secreto: string): boolean {
	return new RegExp(`(?<![\\p{L}\\p{N}_-])${literal(secreto)}(?![\\p{L}\\p{N}_-])`, "u").test(texto);
}

/**
 * Quita los secretos del resultado para guardarlo.
 * @param respuesta La respuesta completa.
 * @param secretos Los campos del resultado que son secretos (siempre de primer nivel: ver la regla de contratos).
 * @returns La respuesta que se guarda: sin esos campos y, si quitó alguno, con `secreto_entregado: true`.
 * @throws Error si el valor de un secreto va escrito en el mensaje o en un aviso, que sí se guardan: es un
 * error del programa y la acción no se guarda.
 */
export function sinSecretos(
	respuesta: { ok: true; resultado: Record<string, unknown>; avisos: string[] },
	secretos: readonly string[],
): unknown {
	const { resultado } = respuesta;
	if (secretos.length === 0) return respuesta;
	const limpio = Object.fromEntries(Object.entries(resultado).filter(([llave]) => !secretos.includes(llave)));
	const quitados = Object.entries(resultado)
		.filter(([llave]) => secretos.includes(llave))
		.map(([, valor]) => valor);
	const textos = [typeof resultado.mensaje === "string" ? resultado.mensaje : "", ...respuesta.avisos];
	for (const valor of quitados) {
		if (typeof valor !== "string" && typeof valor !== "number") continue;
		const secreto = String(valor);
		if (secreto !== "" && textos.some((texto) => llevaElSecreto(texto, secreto))) {
			throw new Error("un secreto aparece fuera de su campo en la respuesta");
		}
	}
	return { ...respuesta, resultado: limpio, ...(quitados.length > 0 ? { secreto_entregado: true } : {}) };
}
