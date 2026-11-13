/**
 * Si quien revisa un lote cosió en él (regla 6 de la revisión de lotes): su persona tiene registros vigentes en el lote.
 * Es la única regla: la usan `calidad.revisar_lote` (que lo apunta en la bitácora) y `calidad.revision_lote` (que lo
 * avisa en la pantalla antes de revisar).
 * Fase 13 · docs/modulos/calidad/revision-de-lotes.md (regla 6)
 * Fase 19 · docs/interfaz/fabrica/calidad.md («Revisar lote»)
 */

import { sql } from "drizzle-orm";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";

/**
 * Si una persona cosió en un lote.
 * @param lector La transacción de la acción o la base de la consulta.
 * @param personaId La persona de la cuenta que revisa; sin persona, no cosió.
 * @param loteId El lote.
 */
export async function cosioEnElLote(
	lector: Pick<Transaccion, "execute">,
	personaId: string | null,
	loteId: string,
): Promise<boolean> {
	if (personaId === null) return false;
	const { rows } = await lector.execute(sql`
		SELECT 1 FROM registros_operacion WHERE lote_id = ${loteId} AND persona_id = ${personaId} AND estado = 'vigente' LIMIT 1`);
	return rows.length > 0;
}
