/**
 * Los contratos de los avisos.
 * Fase 4 · docs/modulos/admin/avisos.md («`admin.marcar_aviso_leido`»)
 */

import { z } from "zod";
import { definirAccion } from "../definir.ts";

/** Cada persona marca leídos sus avisos: unos, o todos. */
export const marcarAvisoLeido = definirAccion({
	nombre: "admin.marcar_aviso_leido",
	descripcion: "Marca leídos los avisos de la cuenta que llama: los que dice, o todos",
	// Uno de los dos es obligatorio: lo revisa la acción, porque el contrato se arma con la forma.
	entrada: z.object({
		aviso_ids: z.array(z.uuid()).optional().describe("Los avisos que se leyeron"),
		todos: z.boolean().optional().describe("Marca leídos todos los avisos de la cuenta"),
	}),
	salida: z.object({}),
	permiso: {},
});
