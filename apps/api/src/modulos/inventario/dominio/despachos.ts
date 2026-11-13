/**
 * Lo que comparten el despacho y sus pantallas: qué traspasos salen con etiquetas.
 * Fase 11 · docs/modulos/inventario/surtido-y-despachos.md (regla 8)
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Despacho»)
 */

/**
 * Los tipos de traspaso que salen con etiquetas: los lotes, los reprocesos y los rollos de un proveedor. Es la lista de
 * `inventario.marcar_etiquetas_impresas`, y con ella la pantalla de Aduana dice qué tiene etiquetas por imprimir.
 */
export const tiposConEtiquetas: ReadonlySet<string> = new Set([
	"lote_cliente",
	"lote_reabasto",
	"lote_temporada",
	"lote_pedido_especial",
	"reproceso",
	"material_proveedor",
]);
