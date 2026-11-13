/**
 * Las consultas de Patronaje que se vuelven a leer cuando una de sus acciones sale bien: lo que cambia una receta o un
 * desarrollo se ve en todas sus pestañas, en sus cajones y en la pastilla del menú.
 * Fase 19 · docs/interfaz/fabrica/patronaje.md
 */

/** Lo que cambia con cualquier acción de Patronaje. */
export const loQueCambiaEnPatronaje = [
	"patronaje.pendientes",
	"patronaje.recetas",
	"patronaje.receta",
	"patronaje.rendimiento",
	"patronaje.rendimiento_prenda",
	"patronaje.desarrollos",
	"patronaje.desarrollo",
	"admin.armazon",
] as const;
