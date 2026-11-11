/**
 * Los permisos de `produccion`: quién lee sus tablas, para los avisos en vivo.
 * Fase 12 · docs/modulos/produccion/operaciones-y-flujos.md, ordenes-de-produccion.md y lotes.md («Permisos»)
 *
 * Personal lee los flujos para poner sus tarifas; Calidad, las operaciones, a las que apuntan sus defectos.
 */

/** Qué departamentos leen cada tabla de `produccion`, para los avisos en vivo. */
export const lectoresDeProduccion: Record<string, readonly string[]> = {
	operaciones: ["produccion", "personal", "calidad"],
	flujos: ["produccion", "personal", "catalogo"],
	flujo_operaciones: ["produccion", "personal"],
	// Los lotes los ven también Ventas, Calidad, Aduana, Bodega, Patronaje y Dirección; la orden no lleva dinero.
	ordenes_produccion: ["produccion", "ventas", "bodega", "direccion"],
	lotes: ["produccion", "ventas", "calidad", "aduana", "bodega", "patronaje", "direccion"],
	lote_tallas: ["produccion", "ventas", "calidad", "aduana", "bodega", "patronaje", "direccion"],
};
