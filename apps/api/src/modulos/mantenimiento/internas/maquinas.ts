/**
 * `mantenimiento.soltar_maquinas_de_persona`: las máquinas que traía una persona que se da de baja quedan sin quién la
 * trae; sus fallas abiertas conservan a quien la traía al fallar.
 * Fase 13 · docs/modulos/mantenimiento/maquinas-fallas-y-servicios.md («La tabla `maquinas`», regla 12)
 *
 * La llama `personal.dar_baja_persona`, en su transacción.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { maquinas } from "../tablas.ts";

/**
 * Deja sin persona las máquinas de una persona.
 * @param datos `persona_id`.
 * @returns Cuántas máquinas soltó.
 */
export async function soltarMaquinasDePersona(contexto: ContextoDeAccion, datos: unknown) {
	const { persona_id } = z.object({ persona_id: z.uuid() }).parse(datos);
	const soltadas = await contexto.transaccion
		.update(maquinas)
		.set({ personaId: null })
		.where(eq(maquinas.personaId, persona_id))
		.returning({ id: maquinas.id });
	return { maquinas: soltadas.length };
}
