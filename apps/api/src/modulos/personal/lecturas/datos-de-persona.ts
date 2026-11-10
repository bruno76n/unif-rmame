/**
 * `personal.datos_de_persona`: lo que otro módulo necesita de una persona para ligarle una cuenta.
 * Fase 7 · docs/modulos/admin/cuentas.md («`admin.crear_cuenta`») y docs/modulos/personal/personas.md
 *
 * La lee con `FOR SHARE`: mientras la cuenta se da de alta, nadie la da de baja; y una baja que ya empezó
 * termina antes, así que el alta la ve dada de baja.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import { noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { personas } from "../tablas.ts";

/** Lo que recibe. */
const pedido = z.object({ persona_id: z.uuid() });

/**
 * La persona: su folio, su nombre, su área y si está activa.
 * @param contexto El contexto de la acción.
 * @param datos `persona_id`.
 * @throws `404` si no existe.
 */
export async function datosDePersona(contexto: ContextoDeAccion, datos: unknown) {
	const { persona_id } = pedido.parse(datos);
	const [persona] = await contexto.transaccion
		.select({
			id: personas.id,
			folio: personas.folio,
			nombre: personas.nombre,
			area: personas.area,
			bajaEn: personas.bajaEn,
		})
		.from(personas)
		.where(eq(personas.id, persona_id))
		.for("share");
	if (persona === undefined) throw noExiste();
	return {
		id: persona.id,
		folio: persona.folio,
		nombre: persona.nombre,
		area: persona.area,
		activa: persona.bajaEn === null,
	};
}
