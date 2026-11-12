/**
 * El reparto de lo que llega del taller: a dónde va un lote (o uno de sus reprocesos) y en qué tipo de A-.
 * Fase 14 · docs/modulos/inventario/recepcion-del-taller.md (reglas 4 y 5)
 *
 * Lo usan la recepción del taller y la aclaración `llego` de una DF- del taller, que entra con el mismo reparto. Un
 * lote de pedido se reparte con lo que le falta al pedido: llega con los pedidos (fase 16).
 */

import { z } from "zod";
import { noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import type { TipoDeTraspaso } from "../tablas.ts";
import { ubicacionDeTipo, ubicacionPorId } from "./recepciones.ts";

/** Lo que regresa `produccion.lote_para_aduana`. */
const loteParaAduana = z
	.object({
		lote_id: z.uuid(),
		folio: z.string(),
		prenda: z.string(),
		estado: z.string(),
		destino: z.enum(["pedido", "tienda", "temporada"]),
		pedido_id: z.uuid().nullable(),
		ubicacion_destino_id: z.uuid().nullable(),
		fecha_entrega: z.string(),
		tallas: z.array(z.object({ variante_id: z.uuid(), piezas_a_bodega: z.number() })),
	})
	.nullable();

/** Un lote como lo lee Aduana. */
export type LoteParaAduana = NonNullable<z.infer<typeof loteParaAduana>>;

/**
 * Lee un lote para recibirlo.
 * @param contexto El contexto de la acción.
 * @param loteId El lote.
 * @throws `404` si no existe.
 */
export async function leerLoteParaAduana(contexto: ContextoDeAccion, loteId: string): Promise<LoteParaAduana> {
	const lote = loteParaAduana.parse(await contexto.lectura("produccion.lote_para_aduana", { lote_id: loteId }));
	if (lote === null) throw noExiste();
	return lote;
}

/** A dónde va lo que llega del taller de un lote: el tipo del A-, su destino y cómo se llama. */
export interface RepartoDelTaller {
	tipo: TipoDeTraspaso;
	destinoId: string;
	destinoNombre: string;
}

/**
 * El reparto de un lote o de un reproceso (regla 4): el de una tienda, todo a su tienda (`lote_reabasto`); el de
 * temporada, todo a Bodega (`lote_temporada`). Un reproceso lleva el mismo destino en un A- `reproceso`.
 * @param contexto El contexto de la acción.
 * @param lote El lote.
 * @param esReproceso Si lo que llega es un reproceso.
 * @throws Error si el lote es de un pedido: su reparto llega con los pedidos (fase 16).
 */
export async function repartoDelTaller(
	contexto: ContextoDeAccion,
	lote: LoteParaAduana,
	esReproceso: boolean,
): Promise<RepartoDelTaller> {
	if (lote.destino === "pedido") throw new Error(`el reparto de ${lote.folio}, de un pedido, llega con la fase 16`);
	const destinoId =
		lote.destino === "tienda"
			? (lote.ubicacion_destino_id ?? "")
			: await ubicacionDeTipo(contexto.transaccion, "bodega");
	const destino = await ubicacionPorId(contexto.transaccion, destinoId);
	if (destino === undefined) throw new Error(`${lote.folio} sin destino`);
	const tipo: TipoDeTraspaso = esReproceso
		? "reproceso"
		: lote.destino === "tienda"
			? "lote_reabasto"
			: "lote_temporada";
	return { tipo, destinoId, destinoNombre: destino.nombre };
}
