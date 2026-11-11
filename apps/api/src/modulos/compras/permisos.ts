/**
 * Los permisos de `compras`: quién lee sus tablas, para los avisos en vivo.
 * Fase 10 · docs/modulos/compras/proveedores-y-precios.md y materiales.md («Permisos»)
 *
 * Los precios y el costo los reciben solo Compras y Contaduría: Aduana y Bodega nunca. Los materiales los leen
 * también Patronaje, Bodega y Aduana, sin costos (no viven en la tabla del material).
 */

/** Qué departamentos leen cada tabla de `compras`, para los avisos en vivo. */
export const lectoresDeCompras: Record<string, readonly string[]> = {
	proveedores: ["compras", "contaduria"],
	materiales: ["compras", "contaduria", "patronaje", "bodega", "aduana", "produccion"],
	material_proveedores: ["compras", "contaduria"],
	precios_compra: ["compras", "contaduria"],
	// Las órdenes llevan precios: Compras y Contaduría. Aduana las ve sin precios con `compras.ordenes_por_recibir`.
	ordenes_compra: ["compras", "contaduria"],
	orden_compra_lineas: ["compras", "contaduria"],
};
