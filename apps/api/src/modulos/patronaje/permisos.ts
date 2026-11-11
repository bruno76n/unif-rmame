/**
 * Los permisos de `patronaje`: quién lee sus tablas, para los avisos en vivo.
 * Fase 10 · docs/modulos/patronaje/recetas.md («Permisos»)
 *
 * La receta no tiene dinero: la leen Patronaje, Compras, Bodega, Producción, Ventas y Catálogo. Los desarrollos,
 * Patronaje, Catálogo y Dirección.
 */

/** Los que leen la receta. */
const leenLaReceta = ["patronaje", "compras", "bodega", "produccion", "ventas", "catalogo"];

/** Qué departamentos leen cada tabla de `patronaje`, para los avisos en vivo. */
export const lectoresDePatronaje: Record<string, readonly string[]> = {
	recetas: leenLaReceta,
	receta_versiones: leenLaReceta,
	receta_lineas: leenLaReceta,
	receta_linea_tallas: leenLaReceta,
	receta_medidas: leenLaReceta,
	// Los desarrollos: Patronaje, y Catálogo, que los da de alta; Dirección decide los que no tienen escuela.
	desarrollos: ["patronaje", "catalogo", "direccion"],
	desarrollo_eventos: ["patronaje", "catalogo", "direccion"],
};
