/**
 * Los permisos de `catalogo`: quién lee sus tablas, para los avisos en vivo.
 * Fase 8 · docs/modulos/catalogo/escuelas-y-secciones.md y tallas-y-tipos-de-prenda.md («Permisos»)
 *
 * Escuelas, secciones, tallas y tipos de prenda no traen dinero: los leen casi todos los departamentos.
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
};
