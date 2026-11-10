/**
 * Los contratos de la bitácora.
 * Fase 4 · docs/modulos/admin/bitacora.md («`admin.marcar_alerta_revisada`»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** La dueña marca revisada una alerta de seguridad. */
export const marcarAlertaRevisada = definirAccion({
	nombre: "admin.marcar_alerta_revisada",
	descripcion: "Marca revisada una alerta de seguridad; deja su propio renglón que apunta a ella",
	entrada: z.object({
		bitacora_id: z.uuid().describe("El renglón de la alerta"),
		nota: z.string().trim().max(120).optional().describe("Una nota de la revisión"),
	}),
	salida: z.object({}),
	permiso: { departamento: "admin", soloDuena: true },
	errores: [
		{ codigo: "no_es_alerta", mensaje: "Ese renglón no es una alerta." },
		{ codigo: "ya_revisada", mensaje: "Esa alerta ya se revisó." },
	],
});
