/**
 * Los parámetros que declara `produccion`: las operaciones de un flujo de «Una sola operación» y la que propone «Va
 * antes de».
 * Fase 12 · docs/modulos/produccion/operaciones-y-flujos.md («Parámetros»)
 *
 * Las operaciones van en texto, separadas por coma y en su orden (decisión 590).
 */

import { semillaDeParametros } from "../../nucleo/parametros.ts";

/** Los parámetros de `produccion`, con su valor inicial. */
export const semillaDeParametrosDeProduccion = semillaDeParametros("produccion", [
	{
		clave: "produccion.flujo_una_sola_operacion",
		seccion: "parametro",
		nombre: "Operaciones de «Una sola operación»",
		explicacion: "Las operaciones después del corte de un flujo de «Una sola operación», en orden y separadas por coma",
		tipo: "texto",
		inicial: "Confección completa,Empaque",
		orden: 1,
	},
	{
		clave: "produccion.operacion_antes_por_omision",
		seccion: "parametro",
		nombre: "Operación que propone «Va antes de»",
		explicacion:
			"Antes de cuál va una operación nueva de un flujo, si la pantalla no escoge otra; si el flujo no la tiene, la última",
		tipo: "texto",
		inicial: "Planchado",
		orden: 2,
	},
]);
