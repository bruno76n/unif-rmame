/**
 * `pnpm base:sembrar`: carga los datos de la muestra en la base local o de pruebas.
 * Fase 2 · docs/cimientos/BASE-DE-DATOS.md («Siembra del sistema y datos de la muestra»)
 *
 * Los datos de la muestra (Instituto Juan Pablo II, PE-0145, L-2026-122, R-0452…) viven en esta carpeta,
 * un archivo por módulo, y se cargan con las acciones del sistema siempre que se pueda. Cada fase agrega
 * los de sus tablas a `cargasDeLaMuestra`. Nunca corren en producción.
 */

import { abrirConexiones, type Base, crearBase } from "../src/nucleo/base/conexion.ts";
import { migrarYSembrar } from "../src/nucleo/base/migrar.ts";
import { leerEntorno } from "../src/nucleo/entorno.ts";
import { cargarAduanaYBodegaDeLaMuestra } from "./aduana-y-bodega.ts";
import { cargarCalidadYMantenimientoDeLaMuestra } from "./calidad-y-mantenimiento.ts";
import { cargarCatalogoDeLaMuestra } from "./catalogo.ts";
import { cargarComprasYPatronajeDeLaMuestra } from "./compras-y-patronaje.ts";
import { cargarConteosYAjustesDeLaMuestra } from "./conteos-y-ajustes.ts";
import { cargarCuentasDeLaMuestra } from "./cuentas.ts";
import { cargarPersonasDeLaMuestra } from "./personas.ts";
import { cargarProduccionDeLaMuestra } from "./produccion.ts";

/** Una carga de la muestra: lo que un módulo mete en la base para que se vea como la muestra. */
export type CargaDeLaMuestra = (base: Base) => Promise<void>;

/** Las cargas de todos los módulos, en orden de dependencia. */
export const cargasDeLaMuestra: readonly CargaDeLaMuestra[] = [
	cargarPersonasDeLaMuestra,
	cargarCuentasDeLaMuestra,
	cargarCatalogoDeLaMuestra,
	cargarComprasYPatronajeDeLaMuestra,
	cargarAduanaYBodegaDeLaMuestra,
	cargarProduccionDeLaMuestra,
	cargarCalidadYMantenimientoDeLaMuestra,
	cargarConteosYAjustesDeLaMuestra,
];

if (import.meta.main) {
	const entorno = leerEntorno();
	if (entorno.ENTORNO === "produccion" || entorno.BASE_DATOS_URL_DUENO === undefined) {
		console.error("Los datos de la muestra solo van en local o en pruebas, con BASE_DATOS_URL_DUENO.");
		process.exit(1);
	}
	await migrarYSembrar(entorno.BASE_DATOS_URL_DUENO);
	const conexiones = abrirConexiones(entorno.BASE_DATOS_URL_DUENO);
	try {
		for (const cargar of cargasDeLaMuestra) await cargar(crearBase(conexiones));
	} finally {
		await conexiones.end();
	}
	console.log(`Datos de la muestra cargados (${cargasDeLaMuestra.length} módulos).`);
}
