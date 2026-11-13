/**
 * Las consultas que se vuelven a leer cuando una acción de Calidad sale bien: lo que cambia una revisión, un reproceso,
 * un defecto, un reclamo o una devolución se ve en todas sus pestañas y en la pastilla del menú.
 * Fase 19 · docs/interfaz/fabrica/calidad.md
 */

/** Lo que cambia con cualquier acción de Calidad. */
export const loQueCambiaEnCalidad = [
	"calidad.pendientes",
	"calidad.por_revisar",
	"calidad.revision_lote",
	"calidad.defectos",
	"calidad.reclamos",
	"calidad.buscar",
	"calidad.opciones_reclamo",
	"calidad.devolucion",
	"admin.armazon",
] as const;
