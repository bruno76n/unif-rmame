/**
 * Los parámetros que declara `personal`.
 * Fase 7 · docs/modulos/personal/pin-del-taller.md («Parámetros»)
 */

import { semillaDeParametros } from "../../nucleo/parametros.ts";

/** Los parámetros de `personal`, con su valor inicial. */
export const semillaDeParametrosDePersonal = semillaDeParametros("personal", [
	{
		clave: "personal.pin_intentos_bloqueo",
		seccion: "parametro",
		nombre: "PIN equivocados que bloquean",
		explicacion: "Cuántos PIN equivocados en la tablet bloquean a la persona",
		tipo: "entero",
		unidad: "intentos",
		inicial: 5,
		minimo: 3,
		maximo: 20,
		bajaA: ["tablet_taller"],
		orden: 1,
	},
	{
		clave: "personal.tablet_inactividad_seg",
		seccion: "tecnico",
		nombre: "Segundos sin tocar la tablet",
		explicacion: "Sin tocar la tablet en ese tiempo, se cierra la sesión de la persona",
		tipo: "entero",
		unidad: "segundos",
		inicial: 90,
		minimo: 15,
		bajaA: ["tablet_taller"],
		orden: 2,
	},
]);
