/**
 * Las horas de paro de una falla abierta que detuvo su máquina.
 * Fase 13 · docs/modulos/mantenimiento/maquinas-fallas-y-servicios.md (regla 6)
 */

import { type DiaDeLaSemana, diasHabilesEntre } from "@uniformame/compartido/calculos/fechas";
import type { Temporal } from "temporal-polyfill";

/** Lo que cuenta el paro: los dos parámetros y los días de trabajo. */
export interface CuentaDeParo {
	/** `mantenimiento.paro_horas_por_dia`. */
	porDia: number;
	/** `mantenimiento.paro_horas_hoy`. */
	deHoy: number;
	diasDeTrabajo: readonly DiaDeLaSemana[];
}

/**
 * Las horas de paro de una falla abierta: las de cada día de trabajo desde el día en que se paró hasta ayer, más las de
 * hoy. Una falla que se paró hoy lleva solo las de hoy.
 * @param paradaElDia El día en que se paró la máquina.
 * @param hoy El día de hoy.
 * @param cuenta Los parámetros y los días de trabajo.
 */
export function horasDeParo(paradaElDia: Temporal.PlainDate, hoy: Temporal.PlainDate, cuenta: CuentaDeParo): number {
	const dias = diasHabilesEntre(paradaElDia.subtract({ days: 1 }), hoy.subtract({ days: 1 }), cuenta.diasDeTrabajo);
	return dias * cuenta.porDia + cuenta.deHoy;
}
