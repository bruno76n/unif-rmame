/**
 * La antigüedad de las cuentas por cobrar: los días desde que venció cada una, su tramo y el saldo de un cliente por
 * tramo.
 * Fase 15 · docs/modulos/contaduria/cuentas-por-cobrar.md (regla 5, «La antigüedad y el saldo por cobrar»)
 *
 * Son funciones puras. Las usan el semáforo sugerido y las consultas de Contaduría (fase 19).
 */

import { Temporal } from "temporal-polyfill";

/**
 * Los días desde que venció una cuenta: 0 si vence hoy o después.
 * @param vence El día en que vence, `AAAA-MM-DD`.
 * @param hoy El día de hoy.
 */
export function diasVencida(vence: string, hoy: Temporal.PlainDate): number {
	return Math.max(0, Temporal.PlainDate.from(vence).until(hoy, { largestUnit: "days" }).days);
}

/**
 * Lee `contaduria.antiguedad_tramos_dias`: los cortes, de menor a mayor.
 * @param texto El valor del parámetro: «15,30».
 * @throws Error si no son enteros positivos que crecen.
 */
export function leerTramos(texto: string): number[] {
	const cortes = texto.split(",").map((parte) => Number(parte.trim()));
	const validos =
		cortes.length > 0 &&
		cortes.every((corte, i) => Number.isInteger(corte) && corte > 0 && (i === 0 || corte > (cortes[i - 1] ?? 0)));
	if (!validos) throw new Error(`los tramos de antigüedad no son días que crecen: ${texto}`);
	return cortes;
}

/**
 * El tramo de una cuenta: 0 por vencer, 1 hasta el primer corte, 2 hasta el segundo… y el último, más del último corte.
 * @param dias Los días vencida.
 * @param cortes Los cortes de los tramos («15,30» da 0, 1 a 15, 16 a 30 y más de 30).
 */
export function tramoDe(dias: number, cortes: readonly number[]): number {
	if (dias === 0) return 0;
	const hasta = cortes.findIndex((corte) => dias <= corte);
	return hasta === -1 ? cortes.length + 1 : hasta + 1;
}

/** Una cuenta con su saldo y su vencimiento. */
export interface CuentaParaAntiguedad {
	saldoCentavos: number;
	vence: string;
}

/** El saldo por cobrar de un cliente, por tramo. */
export interface SaldoPorTramo {
	/** Un saldo por tramo: por vencer, y uno por cada tramo vencido. */
	tramos: number[];
	total: number;
	vencido: number;
	/** Lo vencido de más días que el último corte. */
	vencidoDeMas: number;
}

/**
 * Suma el saldo de las cuentas de un cliente por tramo.
 * @param cuentas Sus cuentas con saldo.
 * @param hoy El día de hoy.
 * @param cortes Los cortes de los tramos.
 */
export function saldoPorTramo(
	cuentas: readonly CuentaParaAntiguedad[],
	hoy: Temporal.PlainDate,
	cortes: readonly number[],
): SaldoPorTramo {
	const tramos = Array.from({ length: cortes.length + 2 }, () => 0);
	for (const cuenta of cuentas) {
		const tramo = tramoDe(diasVencida(cuenta.vence, hoy), cortes);
		tramos[tramo] = (tramos[tramo] ?? 0) + cuenta.saldoCentavos;
	}
	const total = tramos.reduce((suma, saldo) => suma + saldo, 0);
	return {
		tramos,
		total,
		vencido: total - (tramos[0] ?? 0),
		vencidoDeMas: tramos[tramos.length - 1] ?? 0,
	};
}
