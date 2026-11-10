/**
 * Los departamentos de la fábrica, por su clave.
 * Fase 4 · docs/modulos/admin/permisos.md («La siembra»)
 *
 * La tabla `departamentos` llega en la fase 5; mientras, los módulos declaran con estas claves qué
 * departamentos leen cada una de sus tablas (su `permisos.ts`).
 */

/** Las claves de los 15 departamentos, en su orden. */
export const todosLosDepartamentos: readonly string[] = [
	"direccion",
	"compras",
	"catalogo",
	"patronaje",
	"ventas",
	"linea",
	"produccion",
	"puerta_taller",
	"calidad",
	"mantenimiento",
	"aduana",
	"bodega",
	"contaduria",
	"personal",
	"admin",
];
