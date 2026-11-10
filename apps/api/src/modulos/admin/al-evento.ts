/**
 * Lo que hace `admin` al llegar ciertos eventos, dentro del proceso de la bandeja.
 * Fase 4 · docs/modulos/admin/avisos.md («Los tipos») y docs/modulos/admin/bitacora.md (regla 7)
 *
 * `alerta.registrada` (un renglón de bitácora con alerta) se vuelve el aviso `alerta_seguridad` a la
 * dueña, con la descripción de la alerta.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AlEvento } from "../../nucleo/modulos.ts";
import { bitacora } from "./tablas.ts";

/** Los datos de `alerta.registrada`. */
const datosDeLaAlerta = z.object({ bitacora_id: z.uuid() });

/** `alerta.registrada` → el aviso `alerta_seguridad` a la dueña. */
const avisarAlerta: AlEvento = async (contexto, evento) => {
	const { bitacora_id } = datosDeLaAlerta.parse(evento.datos);
	const [alerta] = await contexto.transaccion
		.select({ descripcion: bitacora.descripcion })
		.from(bitacora)
		.where(eq(bitacora.id, bitacora_id));
	if (alerta === undefined) throw new Error(`no existe la alerta ${bitacora_id}`);
	await contexto.interna("admin.crear_aviso", {
		tipo: "alerta_seguridad",
		destinatarios: { regla: "duena" },
		texto: alerta.descripcion,
		enlace: "admin/bitacora",
		entidad: "bitacora",
		entidadId: bitacora_id,
		eventoId: evento.id,
	});
};

/** Por tipo de evento, lo que hace `admin`. */
export const alEventoDeAdmin: Record<string, AlEvento> = {
	"alerta.registrada": avisarAlerta,
};
