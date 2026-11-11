/**
 * Los permisos de `catalogo`: quién lee sus tablas, para los avisos en vivo.
 * Fase 8 · docs/modulos/catalogo/ (los «Permisos» de cada archivo)
 *
 * Escuelas, secciones, tallas y tipos de prenda no traen dinero: los leen casi todos los departamentos. Las
 * listas de precios, solo los que ven precios.
 */

/** Los departamentos de la operación y del almacén, que leen el catálogo sin precios. */
const casiTodos = [
	"catalogo",
	"patronaje",
	"ventas",
	"linea",
	"produccion",
	"calidad",
	"aduana",
	"bodega",
	"compras",
	"direccion",
];

/** Qué departamentos leen cada tabla de `catalogo`, para los avisos en vivo. */
export const lectoresDeCatalogo: Record<string, readonly string[]> = {
	escuelas: casiTodos,
	secciones: casiTodos,
	grupos_talla: casiTodos,
	tallas: casiTodos,
	tipos_prenda: ["catalogo", "patronaje", "produccion"],
	tipo_prenda_medidas: ["catalogo", "patronaje"],
	// Las listas y sus porcentajes son precios: solo los departamentos que ven precios.
	listas_precios: ["catalogo", "ventas", "linea", "contaduria", "direccion"],
	categorias_mayoreo: ["catalogo", "ventas", "linea"],
};
