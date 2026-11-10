/**
 * `personal.entra_al_sistema`: por persona, por dónde entra al sistema.
 * Fase 7 · docs/modulos/personal/personas.md («`personal.entra_al_sistema`», regla 4)
 *
 * «Baja {fecha}» si está dada de baja; «Cuenta de Google · {puesto}» si tiene una cuenta activa; «Sistema
 * de su tienda» en una tienda; en el Taller, «PIN del taller» si tiene un PIN vivo o «Sin PIN»; en la oficina o
 * Aduana y bodega sin cuenta, «Sin cuenta» (decisión 419).
 */

import { zonaDelNegocio } from "@uniformame/compartido/calculos/fechas";
import { and, eq, inArray } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import type { Base } from "../../../nucleo/base/conexion.ts";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { usuarios } from "../../admin/tablas.ts";
import { personas, pines } from "../tablas.ts";

/** Lo que recibe. */
const pedido = z.object({ persona_ids: z.array(z.uuid()) });

/**
 * Por dónde entra cada persona.
 * @param base La base o la transacción.
 * @param personaIds Las personas.
 * @returns Por persona, el texto de «Entra al sistema».
 */
export async function porDondeEntran(
	base: Base | Transaccion,
	personaIds: readonly string[],
): Promise<Map<string, string>> {
	if (personaIds.length === 0) return new Map();
	const leidas = await base
		.select({
			id: personas.id,
			area: personas.area,
			puesto: personas.puesto,
			bajaEn: personas.bajaEn,
			cuenta: usuarios.id,
			pin: pines.id,
		})
		.from(personas)
		.leftJoin(usuarios, and(eq(usuarios.personaId, personas.id), eq(usuarios.estado, "activa")))
		.leftJoin(pines, and(eq(pines.personaId, personas.id), inArray(pines.estado, ["activo", "bloqueado"])))
		.where(inArray(personas.id, [...personaIds]));
	return new Map(
		leidas.map((persona) => {
			if (persona.bajaEn !== null) {
				const dia = Temporal.Instant.from(new Date(persona.bajaEn).toISOString()).toZonedDateTimeISO(zonaDelNegocio);
				return [persona.id, `Baja ${dia.toPlainDate().toString()}`];
			}
			if (persona.cuenta !== null) return [persona.id, `Cuenta de Google · ${persona.puesto}`];
			if (persona.area === "tienda") return [persona.id, "Sistema de su tienda"];
			if (persona.area === "taller") return [persona.id, persona.pin === null ? "Sin PIN" : "PIN del taller"];
			return [persona.id, "Sin cuenta"];
		}),
	);
}

/**
 * La lectura para los demás módulos.
 * @param contexto El contexto de la acción.
 * @param datos `persona_ids`.
 * @returns Un renglón por persona: `persona_id` y `entra`.
 */
export async function entraAlSistema(contexto: ContextoDeAccion, datos: unknown) {
	const { persona_ids } = pedido.parse(datos);
	const entran = await porDondeEntran(contexto.transaccion, persona_ids);
	return [...entran].map(([persona_id, entra]) => ({ persona_id, entra }));
}
