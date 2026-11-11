/**
 * `inventario.rollos_para_corte`: los rollos que el cierre de un corte va a usar, bloqueados, con lo que tiene cada
 * uno para ese lote: en el Taller si está entregado a él, o en Bodega si está disponible.
 * Fase 12 · docs/modulos/inventario/entregas-a-corte.md (regla 7) y docs/modulos/produccion/corte-y-bultos.md
 * (regla 3)
 *
 * Los bloquea con `FOR UPDATE` en orden de id, así lo que cuenta `produccion.cerrar_corte` es lo mismo que después
 * mueve `inventario.registrar_corte` en la misma transacción. No lleva costos.
 */

import { deMilesimos } from "@uniformame/compartido/calculos/cuenta-material";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { rollosEnUso } from "../dominio/corte.ts";
import { ubicacionDeTipo } from "../dominio/recepciones.ts";

/** Lo que recibe. */
const pedido = z.object({ lote_id: z.uuid(), rollo_ids: z.array(z.uuid()) });

/**
 * Los rollos, con su tela, su partida y lo que tienen para el lote.
 * @param contexto El contexto de `produccion.cerrar_corte`.
 * @param datos El lote y los rollos.
 * @returns Por rollo: `metros` (vacío si no está disponible para el lote) y, si está entregado a otro, su lote.
 */
export async function rollosParaCorte(contexto: ContextoDeAccion, datos: unknown) {
	const { lote_id, rollo_ids } = pedido.parse(datos);
	const taller = await ubicacionDeTipo(contexto.transaccion, "taller");
	const bodega = await ubicacionDeTipo(contexto.transaccion, "bodega");
	const enTaller = await rollosEnUso(contexto, rollo_ids, taller);
	const enBodega = await rollosEnUso(contexto, rollo_ids, bodega);
	return {
		rollos: enTaller.map((rollo) => {
			const deBodega = enBodega.find((suyo) => suyo.rolloId === rollo.rolloId);
			const delLote = rollo.entregadoA?.loteId === lote_id && rollo.estado === "entregado" && rollo.milesimos > 0n;
			const libre = rollo.entregadoA === null && deBodega?.estado === "disponible" && deBodega.milesimos > 0n;
			return {
				rollo_id: rollo.rolloId,
				folio: rollo.folio,
				material_id: rollo.materialId,
				partida: rollo.partida,
				metros: delLote ? deMilesimos(rollo.milesimos) : libre ? deMilesimos(deBodega?.milesimos ?? 0n) : null,
				entregado_a: rollo.entregadoA !== null && rollo.entregadoA.loteId !== lote_id ? rollo.entregadoA.folio : null,
			};
		}),
	};
}
