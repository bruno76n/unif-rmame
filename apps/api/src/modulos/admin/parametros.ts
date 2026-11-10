/**
 * Los parámetros que declara `admin`: los generales que usan todos, las versiones mínimas de cada app y
 * cuánto se guardan los eventos.
 * Fase 4 · docs/modulos/admin/configuracion.md («Parámetros»), docs/cimientos/API.md y
 * docs/cimientos/EVENTOS-Y-TRABAJOS.md («Parámetros»)
 */

import { type DefinicionDeParametro, semillaDeParametros } from "../../nucleo/parametros.ts";

/** Los parámetros de `admin`, con su valor inicial. */
export const parametrosDeAdmin: readonly DefinicionDeParametro[] = [
	{
		clave: "general.largo_minimo_motivo",
		seccion: "parametro",
		nombre: "Largo mínimo de un motivo",
		explicacion: "Lo mínimo que se escribe al cancelar, dar de baja, ajustar o rechazar",
		tipo: "entero",
		unidad: "letras",
		inicial: 5,
		minimo: 1,
		orden: 10,
	},
	{
		clave: "general.dias_de_trabajo",
		seccion: "parametro",
		nombre: "Días de trabajo",
		explicacion: "Los días hábiles de la fábrica, del 1 (lunes) al 7 (domingo), separados por coma",
		tipo: "texto",
		inicial: "1,2,3,4,5,6",
		orden: 20,
	},
	{
		clave: "admin.version_minima_web",
		seccion: "tecnico",
		nombre: "Versión mínima de la web",
		explicacion: "La versión más vieja de la web que se acepta",
		tipo: "texto",
		inicial: "1.0.0",
		orden: 900,
	},
	{
		clave: "admin.version_minima_tablet",
		seccion: "tecnico",
		nombre: "Versión mínima de la tablet",
		explicacion: "La versión más vieja de la tablet del taller que se acepta",
		tipo: "texto",
		inicial: "1.0.0",
		orden: 910,
	},
	{
		clave: "admin.version_minima_puente",
		seccion: "tecnico",
		nombre: "Versión mínima del programa puente",
		explicacion: "La versión más vieja del programa puente que se acepta",
		tipo: "texto",
		inicial: "1.0.0",
		orden: 920,
	},
	{
		clave: "admin.dias_guardar_eventos",
		seccion: "tecnico",
		nombre: "Días que se guardan los eventos",
		explicacion: "Cuánto se guardan los eventos ya procesados",
		tipo: "entero",
		unidad: "días",
		inicial: 90,
		minimo: 1,
		orden: 930,
	},
];

/** La siembra de los parámetros de `admin`. */
export const semillaDeParametrosDeAdmin = semillaDeParametros("admin", parametrosDeAdmin);
