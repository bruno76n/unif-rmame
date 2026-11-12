/**
 * La antigüedad de las cuentas por pagar, el saldo por pagar y el flujo de los próximos días.
 * Fase 17 · docs/modulos/contaduria/cuentas-por-pagar.md (reglas 4 y 8, «La antigüedad y el saldo por pagar»)
 *
 * Son funciones puras. Las usan las consultas de Contaduría (fase 19).
 */

import { Temporal } from "temporal-polyfill";
import type { EstadoDeCuentaPorPagar } from "../tablas.ts";

/** Una cuenta por pagar con lo que necesitan estas cuentas. */
export interface CuentaParaPagar {
	estado: EstadoDeCuentaPorPagar;
	vence: string;
	saldoCentavos: number;
}

/** Una cuenta por cobrar con lo que necesita el flujo. */
export interface CuentaParaCobrar {
	vence: string;
	saldoCentavos: number;
}

/** Si una cuenta todavía se debe: ni pagada ni cancelada. */
function seDebe(cuenta: CuentaParaPagar): boolean {
	return cuenta.estado !== "pagada" && cuenta.estado !== "cancelada";
}

/** Si una cuenta entra al calendario: se debe y no está detenida (regla 4). */
function enCalendario(cuenta: CuentaParaPagar): boolean {
	return seDebe(cuenta) && cuenta.estado !== "detenida";
}

/**
 * El saldo por pagar (regla 8): las cuentas no pagadas ni canceladas, también las detenidas.
 * @param cuentas Las cuentas por pagar.
 */
export function saldoPorPagar(cuentas: readonly CuentaParaPagar[]): number {
	return cuentas.filter(seDebe).reduce((suma, cuenta) => suma + cuenta.saldoCentavos, 0);
}

/** Lo por pagar por plazo, sin detenidas. */
export interface AntiguedadPorPagar {
	vencido: number;
	/** De hoy a `contaduria.ventana_dias` − 1 días. */
	estaSemana: number;
	/** Las cuatro ventanas siguientes, una por semana. */
	semanas: number[];
	/** Lo que vence después. */
	despues: number;
}

/**
 * Lo vencido, lo que vence esta semana (de hoy a la ventana − 1 días), las cuatro semanas siguientes y lo de después,
 * sin las detenidas (regla 4).
 * @param cuentas Las cuentas por pagar.
 * @param hoy El día de hoy.
 * @param ventana `contaduria.ventana_dias`.
 */
export function antiguedadPorPagar(
	cuentas: readonly CuentaParaPagar[],
	hoy: Temporal.PlainDate,
	ventana: number,
): AntiguedadPorPagar {
	const antiguedad: AntiguedadPorPagar = { vencido: 0, estaSemana: 0, semanas: [0, 0, 0, 0], despues: 0 };
	for (const cuenta of cuentas.filter(enCalendario)) {
		const dias = hoy.until(Temporal.PlainDate.from(cuenta.vence), { largestUnit: "days" }).days;
		const ventanaDeLaCuenta = Math.floor(dias / ventana);
		if (dias < 0) antiguedad.vencido += cuenta.saldoCentavos;
		else if (ventanaDeLaCuenta === 0) antiguedad.estaSemana += cuenta.saldoCentavos;
		else if (ventanaDeLaCuenta <= 4) {
			antiguedad.semanas[ventanaDeLaCuenta - 1] =
				(antiguedad.semanas[ventanaDeLaCuenta - 1] ?? 0) + cuenta.saldoCentavos;
		} else antiguedad.despues += cuenta.saldoCentavos;
	}
	return antiguedad;
}

/** Un día del flujo: lo que vence por cobrar, por pagar y lo neto. */
export interface DiaDelFlujo {
	dia: string;
	porCobrar: number;
	porPagar: number;
	neto: number;
}

/**
 * El flujo de los próximos días: día por día, de hoy a la ventana − 1, lo que vence por cobrar menos lo que vence por
 * pagar, sin detenidas ni lo ya vencido.
 * @param porCobrar Las cuentas por cobrar con saldo.
 * @param porPagar Las cuentas por pagar.
 * @param hoy El día de hoy.
 * @param ventana `contaduria.ventana_dias`.
 */
export function flujoDeLosProximosDias(
	porCobrar: readonly CuentaParaCobrar[],
	porPagar: readonly CuentaParaPagar[],
	hoy: Temporal.PlainDate,
	ventana: number,
): DiaDelFlujo[] {
	return Array.from({ length: ventana }, (_, i) => {
		const dia = hoy.add({ days: i }).toString();
		const cobrar = porCobrar
			.filter((cuenta) => cuenta.vence === dia)
			.reduce((suma, cuenta) => suma + cuenta.saldoCentavos, 0);
		const pagar = porPagar
			.filter((cuenta) => enCalendario(cuenta) && cuenta.vence === dia)
			.reduce((suma, cuenta) => suma + cuenta.saldoCentavos, 0);
		return { dia, porCobrar: cobrar, porPagar: pagar, neto: cobrar - pagar };
	});
}
