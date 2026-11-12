/**
 * El reparto de un cambio de pedido: de dónde se quitan las piezas de más de cada talla y qué lotes por cortar quedan
 * en cero (reglas 4 y 5 de docs/modulos/produccion/cambios-a-pedido.md).
 * Fase 12 · docs/modulos/produccion/cambios-a-pedido.md
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Pendientes»: «Cambio de pedido»)
 *
 * Es la única regla del reparto: la aplica `produccion.aplicar_cambio_pedido` y la muestra antes `produccion.pendientes`.
 * Primero de las planeadas de los lotes por cortar, el de corte más lejano primero; lo que falte, a lo que va a Bodega
 * de los ya cortados, el más reciente primero, sin pasar de cortadas − merma − lo ya marcado.
 */

/** Una talla de un lote del pedido. */
export interface TallaDelLote {
	varianteId: string;
	planeadas: number;
	cortadas: number;
	merma: number;
	aBodega: number;
}

/** Un lote del pedido que sigue en producción (por cortar, en proceso, terminado o revisado). */
export interface LoteDelPedido {
	id: string;
	folio: string;
	estado: string;
	fechaCorte: string;
	/** Cuándo se cortó (ISO), si ya se cortó. */
	cortadoEn: string | null;
	tallas: TallaDelLote[];
}

/** Lo que el cambio hace en una talla de un lote. */
export interface LineaDelReparto {
	loteId: string;
	loteFolio: string;
	varianteId: string;
	restadas: number;
	aBodega: number;
}

/**
 * Reparte las piezas de más de cada talla entre los lotes del pedido.
 * @param deMas Por variante, las piezas de más (de `ventas.avance_pedido`).
 * @param lotes Los lotes del pedido que siguen en producción, con sus tallas.
 * @returns Lo que se resta o se manda a Bodega en cada lote y talla, y los folios de los lotes por cortar tocados que
 * quedan en cero.
 */
export function repartirPiezasDeMas(
	deMas: readonly { varianteId: string; piezas: number }[],
	lotes: readonly LoteDelPedido[],
): { lineas: LineaDelReparto[]; cancelados: string[] } {
	// Una copia de las tallas, que se va descontando como lo hace la acción.
	const tallas = new Map(lotes.map((lote) => [lote.id, lote.tallas.map((talla) => ({ ...talla }))]));
	const porCortar = lotes
		.filter((lote) => lote.estado === "por_cortar")
		.sort((uno, otro) => (uno.fechaCorte < otro.fechaCorte ? 1 : uno.fechaCorte > otro.fechaCorte ? -1 : 0));
	const cortados = lotes
		.filter((lote) => lote.estado !== "por_cortar")
		.sort((uno, otro) => ((uno.cortadoEn ?? "") < (otro.cortadoEn ?? "") ? 1 : -1));
	const lineas: LineaDelReparto[] = [];
	for (const talla of deMas.filter((una) => una.piezas > 0)) {
		let falta = talla.piezas;
		for (const lote of porCortar) {
			const suya = tallas.get(lote.id)?.find((una) => una.varianteId === talla.varianteId);
			if (suya === undefined || falta === 0) continue;
			const restadas = Math.min(falta, suya.planeadas);
			if (restadas === 0) continue;
			suya.planeadas -= restadas;
			falta -= restadas;
			lineas.push({ loteId: lote.id, loteFolio: lote.folio, varianteId: talla.varianteId, restadas, aBodega: 0 });
		}
		for (const lote of cortados) {
			const suya = tallas.get(lote.id)?.find((una) => una.varianteId === talla.varianteId);
			if (suya === undefined || falta === 0) continue;
			const aBodega = Math.min(falta, Math.max(0, suya.cortadas - suya.merma - suya.aBodega));
			if (aBodega === 0) continue;
			suya.aBodega += aBodega;
			falta -= aBodega;
			lineas.push({ loteId: lote.id, loteFolio: lote.folio, varianteId: talla.varianteId, restadas: 0, aBodega });
		}
	}
	// Un lote por cortar que el cambio tocó y queda en cero se quita de su orden.
	const tocados = new Set(lineas.map((linea) => linea.loteId));
	const cancelados = porCortar
		.filter(
			(lote) =>
				tocados.has(lote.id) && (tallas.get(lote.id) ?? []).reduce((total, talla) => total + talla.planeadas, 0) === 0,
		)
		.map((lote) => lote.folio);
	return { lineas, cancelados };
}
