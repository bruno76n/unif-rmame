/**
 * Los departamentos de la fábrica, por su clave.
 * Fase 4 · docs/modulos/admin/permisos.md («La siembra»)
 *
 * La tabla `departamentos` llega en la fase 5; mientras, los módulos declaran con estas claves qué
 * departamentos leen cada una de sus tablas (su `permisos.ts`), y los archivos saben qué departamentos
 * atienden cada módulo.
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

/** Los departamentos que atiende cada módulo («Módulo que lo atiende» de docs/modulos/admin/permisos.md). */
export const departamentosDelModulo: Readonly<Record<string, readonly string[]>> = {
	direccion: ["direccion"],
	compras: ["compras"],
	catalogo: ["catalogo"],
	patronaje: ["patronaje"],
	ventas: ["ventas"],
	linea: ["linea"],
	produccion: ["produccion", "puerta_taller"],
	calidad: ["calidad"],
	mantenimiento: ["mantenimiento"],
	inventario: ["aduana", "bodega"],
	contaduria: ["contaduria"],
	personal: ["personal"],
	admin: ["admin"],
};
