/**
 * La siembra de los 15 departamentos.
 * Fase 5 · docs/modulos/admin/permisos.md («La tabla `departamentos`»)
 *
 * Son fijos: un departamento nuevo es código nuevo, no un dato. La Puerta del taller no se da en un alta:
 * se entra con PIN.
 */

import { v7 as uuidv7 } from "uuid";
import type { Semilla } from "../../../nucleo/base/siembra.ts";
import { departamentos } from "../tablas.ts";

/** Los departamentos: clave, nombre y grupo, en el orden del menú. */
const losDepartamentos: readonly [string, string, string | null][] = [
	["direccion", "Dirección", null],
	["compras", "Compras", "operacion"],
	["catalogo", "Catálogo", "operacion"],
	["patronaje", "Patronaje", "operacion"],
	["ventas", "Ventas a externos", "operacion"],
	["linea", "Tienda en línea", "operacion"],
	["produccion", "Producción", "taller"],
	["puerta_taller", "Puerta del taller", "taller"],
	["calidad", "Calidad", "taller"],
	["mantenimiento", "Mantenimiento", "taller"],
	["aduana", "Aduana", "almacen"],
	["bodega", "Bodega", "almacen"],
	["contaduria", "Contaduría", "administracion"],
	["personal", "Personal", "administracion"],
	["admin", "Administración del sistema", "administracion"],
];

/** La siembra de `departamentos`. */
export const semillaDeDepartamentos: Semilla = {
	tabla: departamentos,
	filas: losDepartamentos.map(([clave, nombre, grupo], i) => ({
		id: uuidv7(),
		clave,
		nombre,
		grupo,
		orden: i + 1,
		asignableEnAlta: clave !== "puerta_taller",
	})),
};
