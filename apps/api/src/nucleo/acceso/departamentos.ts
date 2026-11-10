/**
 * Los departamentos de la fábrica, por su clave.
 * Fase 4 · docs/modulos/admin/permisos.md («La siembra»)
 *
 * Los módulos declaran con estas claves qué departamentos leen cada una de sus tablas (su `permisos.ts`), y
 * los archivos saben qué departamentos atienden cada módulo. La tabla `departamentos` (fase 5) tiene las
 * mismas claves en su CHECK.
 */

import { clavesDeDepartamento } from "@uniformame/compartido/contratos/admin/cuentas";

/** Las claves de los 15 departamentos, en su orden: las del contrato de las cuentas. */
export const todosLosDepartamentos: readonly string[] = clavesDeDepartamento;

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
