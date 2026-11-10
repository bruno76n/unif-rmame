/**
 * `admin.registrar_respaldo`: deja el registro de un respaldo semanal, correcto o fallido.
 * Fase 4 · docs/modulos/admin/respaldos.md («`admin.registrar_respaldo` · interna»)
 *
 * Guarda `respaldo.hecho`; si falló, avisa `respaldo_fallido` a la dueña y a soporte.
 */

import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { respaldos } from "../tablas.ts";

/** Lo que recibe. */
const respaldo = z.object({
	hecho_en: z.string(),
	estado: z.enum(["correcto", "fallido"]),
	tamano_bytes: z.number().int().nonnegative().optional(),
	cifrado: z.boolean(),
	destino: z.string().min(1),
	sha256: z
		.string()
		.regex(/^[0-9a-f]{64}$/)
		.optional(),
	error: z.string().optional(),
});

/**
 * El texto del aviso de un respaldo que no se hizo.
 * @param error Por qué no se hizo.
 */
export function textoDeRespaldoFallido(error: string): string {
	return `El respaldo semanal no se hizo: ${error}.`;
}

/**
 * Registra el respaldo.
 * @param contexto El contexto del trabajo del respaldo.
 * @param datos Cuándo, cómo quedó, su tamaño, si va cifrado, dónde quedó (sin llaves), su suma y su error.
 * @returns `respaldo_id`.
 */
export async function registrarRespaldo(contexto: ContextoDeAccion, datos: unknown): Promise<{ respaldo_id: string }> {
	const registro = respaldo.parse(datos);
	const id = uuidv7();
	await contexto.transaccion.insert(respaldos).values({
		id,
		hechoEn: registro.hecho_en,
		estado: registro.estado,
		tamanoBytes: registro.tamano_bytes ?? null,
		cifrado: registro.cifrado,
		destino: registro.destino,
		sha256: registro.sha256 ?? null,
		error: registro.error ?? null,
	});
	await contexto.interna("admin.guardar_evento", {
		tipo: "respaldo.hecho",
		modulo: "admin",
		datos: { respaldo_id: id, estado: registro.estado },
		tablas: ["respaldos"],
		entidad: "respaldos",
		entidadId: id,
	});
	if (registro.estado === "fallido") {
		for (const regla of ["duena", "soporte"]) {
			await contexto.interna("admin.crear_aviso", {
				tipo: "respaldo_fallido",
				destinatarios: { regla },
				texto: textoDeRespaldoFallido(registro.error ?? "sin mensaje"),
				enlace: "admin/respaldos",
				entidad: "respaldos",
				entidadId: id,
			});
		}
	}
	return { respaldo_id: id };
}
