/**
 * Lo que Producción le pide a las entregas a corte: qué lotes ya tienen tela entregada y devolver la entrega de un
 * lote que se quitó.
 * Fase 12 · docs/modulos/inventario/entregas-a-corte.md (reglas 9 y 10, «`inventario.devolver_entrega_corte`»,
 * «`inventario.lotes_con_tela_entregada`»)
 *
 * Los avíos de una entrega devuelta regresan a Bodega con un traspaso `regresa` cuando Ventas quite lotes con sus
 * cambios de pedido, en la fase 16 (decisión 601); aquí regresa la tela.
 */

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { telasRecibidas } from "../dominio/corte.ts";
import { apartadosRollo, entregasCorte, rollos } from "../tablas.ts";

/** Lo que recibe `inventario.lotes_con_tela_entregada`. */
const deLotes = z.object({ lote_ids: z.array(z.uuid()) });

/**
 * `inventario.lotes_con_tela_entregada`: cuáles de esos lotes tienen una entrega `entregada` o `cerrada`, qué telas ya
 * recibió cada uno y si ya recibió sus avíos (van en su primera entrega).
 * @param contexto El contexto de quien lee (Compras y Producción).
 * @param datos `lote_ids`.
 */
export async function lotesConTelaEntregada(contexto: ContextoDeAccion, datos: unknown) {
	const { lote_ids } = deLotes.parse(datos);
	if (lote_ids.length === 0) return { lotes: [] };
	const conEntrega = await contexto.transaccion
		.selectDistinct({ loteId: entregasCorte.loteId })
		.from(entregasCorte)
		.where(and(inArray(entregasCorte.loteId, lote_ids), inArray(entregasCorte.estado, ["entregada", "cerrada"])));
	const telas = await telasRecibidas(
		contexto,
		conEntrega.map((suyo) => suyo.loteId),
	);
	return {
		lotes: conEntrega.map(({ loteId }) => ({
			lote_id: loteId,
			telas: telas.filter((tela) => tela.loteId === loteId).map((tela) => tela.materialId),
			avios_entregados: true,
		})),
	};
}

/**
 * `inventario.devolver_entrega_corte`: la entrega de un lote que se quitó queda devuelta; sus rollos quedan por
 * recibir en el Taller y sus apartados, liberados.
 * @param contexto El contexto de Producción.
 * @param datos `lote_id`.
 * @returns Cuántas entregas y cuántos rollos regresan.
 */
export async function devolverEntregaCorte(contexto: ContextoDeAccion, datos: unknown) {
	const { lote_id } = z.object({ lote_id: z.uuid() }).parse(datos);
	const { transaccion } = contexto;
	const devueltas = await transaccion
		.update(entregasCorte)
		.set({ estado: "devuelta" })
		.where(and(eq(entregasCorte.loteId, lote_id), eq(entregasCorte.estado, "entregada")))
		.returning({ id: entregasCorte.id });
	const liberados = await transaccion
		.update(apartadosRollo)
		.set({ estado: "liberado" })
		.where(and(eq(apartadosRollo.loteId, lote_id), inArray(apartadosRollo.estado, ["sugerido", "entregado"])))
		.returning({ rolloId: apartadosRollo.rolloId, estabaEntregado: apartadosRollo.entregaCorteId });
	const rolloIds = liberados.flatMap((suyo) => (suyo.estabaEntregado === null ? [] : [suyo.rolloId]));
	if (rolloIds.length > 0) {
		await transaccion
			.update(rollos)
			.set({ estado: "por_recibir" })
			.where(and(inArray(rollos.id, rolloIds), eq(rollos.estado, "entregado")));
		contexto.guardarEvento({
			tipo: "rollo.por_recibir",
			datos: { lote_id },
			tablas: ["rollos", "apartados_rollo", "entregas_corte"],
		});
	}
	return { entregas: devueltas.length, rollos: rolloIds.length };
}
