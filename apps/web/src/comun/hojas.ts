/**
 * Abrir una hoja en PDF (el pedido, la nota de entrega, la hoja del lote, la del despacho) en otra pestaña del
 * navegador: de ahí se imprime, se guarda o se manda.
 * Fase 20 · docs/impresos/hojas.md (regla 7)
 */

/**
 * Abre la hoja de un documento.
 * @param tipo El tipo de hoja: `pedido`, `nota_entrega`, `lote`, `despacho`.
 * @param id El documento.
 */
export function abrirHoja(tipo: string, id: string): void {
	window.open(`/v1/etiquetas/${tipo}/${id}?formato=pdf`, "_blank", "noopener");
}
