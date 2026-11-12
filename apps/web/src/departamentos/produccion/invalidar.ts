/**
 * Las consultas de Producción que se vuelven a leer cuando una de sus acciones sale bien: lo que cambia un lote, un
 * corte, una orden o un flujo se ve en todas sus pestañas, en el cajón y en la pastilla del menú.
 * Fase 19 · docs/interfaz/fabrica/produccion.md
 */

/** Lo que cambia con cualquier acción de Producción. */
export const loQueCambiaEnProduccion = [
	"produccion.pendientes",
	"produccion.lotes",
	"produccion.lote",
	"produccion.costo_lote",
	"produccion.ordenes",
	"produccion.corte",
	"produccion.operaciones",
	"produccion.produccion_por_persona",
	"produccion.hilo_pedido",
	"admin.armazon",
] as const;
