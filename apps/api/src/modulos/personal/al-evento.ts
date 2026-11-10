/**
 * Lo que hace `personal` al llegar sus eventos, dentro del proceso de la bandeja.
 * Fase 7 · docs/modulos/personal/pin-del-taller.md (`personal.bloquear_pin`) y docs/modulos/admin/avisos.md
 *
 * `pin.bloqueado` avisa `pin_bloqueado` a las cuentas con Personal: «{persona} se bloqueó en la tablet por {n}
 * PIN equivocados».
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AlEvento } from "../../nucleo/modulos.ts";
import { personas } from "./tablas.ts";

/** Los datos de `pin.bloqueado`. */
const pinBloqueado = z.object({ persona_id: z.uuid(), pin_id: z.uuid(), intentos: z.number().int() });

/** `pin.bloqueado` → el aviso `pin_bloqueado` a Personal. */
const avisarBloqueo: AlEvento = async (contexto, evento) => {
	const datos = pinBloqueado.parse(evento.datos);
	const [persona] = await contexto.transaccion
		.select({ nombre: personas.nombre })
		.from(personas)
		.where(eq(personas.id, datos.persona_id));
	if (persona === undefined) throw new Error(`no existe la persona ${datos.persona_id}`);
	await contexto.interna("admin.crear_aviso", {
		tipo: "pin_bloqueado",
		destinatarios: { regla: "departamento:personal" },
		texto: `${persona.nombre} se bloqueó en la tablet por ${datos.intentos} PIN equivocados`,
		enlace: "personal/pin",
		entidad: "pines",
		entidadId: datos.pin_id,
		eventoId: evento.id,
	});
};

/** Por tipo de evento, lo que hace `personal`. */
export const alEventoDePersonal: Record<string, AlEvento> = {
	"pin.bloqueado": avisarBloqueo,
};
