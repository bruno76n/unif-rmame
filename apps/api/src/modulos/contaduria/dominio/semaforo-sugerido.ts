/**
 * El semáforo de crédito que sugiere el sistema y el uso del límite de un cliente.
 * Fase 15 · docs/modulos/contaduria/credito-de-clientes.md (reglas 4 y 5, «El semáforo sugerido»)
 *
 * Es una función pura: quien la llama lee el límite, las cuentas por cobrar con saldo del cliente, el día de hoy y los
 * dos parámetros. La usan `contaduria.cambiar_limite_credito`, `contaduria.credito_de_cliente` y las consultas de
 * Contaduría (fase 19). El semáforo de verdad lo pone Contaduría a mano: esto solo lo sugiere.
 */

import { aplicarPorcentaje } from "@uniformame/compartido/calculos/dinero";
import { centavos } from "@uniformame/compartido/tipos/base";
import type { Temporal } from "temporal-polyfill";
import type { semaforosDeCredito } from "../tablas.ts";
import { diasVencida } from "./antiguedad.ts";

/** Un semáforo de crédito. */
export type SemaforoDeCredito = (typeof semaforosDeCredito)[number];

/** Una cuenta por cobrar del cliente, con su saldo y su vencimiento. */
export interface CuentaConSaldo {
	saldoCentavos: number;
	/** `AAAA-MM-DD`. */
	vence: string;
}

/** Lo que recibe el semáforo sugerido. */
export interface DatosDelSemaforo {
	/** 0 es sin crédito. */
	limiteCentavos: number;
	cuentas: readonly CuentaConSaldo[];
	hoy: Temporal.PlainDate;
	/** `contaduria.credito_dias_vencido_detenido`. */
	diasVencidoDetenido: number;
	/** `contaduria.credito_porcentaje_cerca_limite`. */
	porcentajeCercaLimite: number | string;
}

/** Lo que regresa el semáforo sugerido. */
export interface SemaforoCalculado {
	sugerido: SemaforoDeCredito;
	/** La suma de los saldos por cobrar. */
	saldoCentavos: number;
	/** El saldo entre el límite, en porcentaje entero hacia abajo; `null` sin crédito. */
	usoPorcentaje: number | null;
	/** Usa más del porcentaje de su límite: ámbar, y rojo si además lo pasa (regla 5). Sin crédito, nunca. */
	cercaDelLimite: boolean;
	/** El saldo pasa el límite. Sin crédito, nunca. */
	pasaElLimite: boolean;
	/** Los días del vencido más viejo con saldo; 0 si nada está vencido. */
	diasVencido: number;
}

/**
 * Sugiere el semáforo de crédito de un cliente (regla 4) y calcula el uso de su límite (regla 5).
 * @param datos El límite, las cuentas con saldo, el día de hoy y los dos parámetros.
 * @returns «Detenido» con algo vencido de más días que el parámetro o con el saldo arriba del límite; «Cerca del
 * límite» con algo vencido o con el uso arriba del porcentaje; «Al corriente» lo demás. Sin crédito, solo cuenta lo
 * vencido.
 */
export function semaforoSugerido(datos: DatosDelSemaforo): SemaforoCalculado {
	const conSaldo = datos.cuentas.filter((cuenta) => cuenta.saldoCentavos > 0);
	const saldoCentavos = conSaldo.reduce((suma, cuenta) => suma + cuenta.saldoCentavos, 0);
	// El vencido más viejo: los días desde que venció la cuenta con saldo que venció primero.
	const diasVencido = Math.max(0, ...conSaldo.map((cuenta) => diasVencida(cuenta.vence, datos.hoy)));
	const conCredito = datos.limiteCentavos > 0;
	const pasaElLimite = conCredito && saldoCentavos > datos.limiteCentavos;
	const cercaDelLimite =
		conCredito && saldoCentavos > aplicarPorcentaje(centavos(datos.limiteCentavos), datos.porcentajeCercaLimite);
	const usoPorcentaje = conCredito ? Number((BigInt(saldoCentavos) * 100n) / BigInt(datos.limiteCentavos)) : null;
	const sugerido: SemaforoDeCredito =
		diasVencido > datos.diasVencidoDetenido || pasaElLimite
			? "detenido"
			: diasVencido > 0 || cercaDelLimite
				? "cerca_del_limite"
				: "al_corriente";
	return { sugerido, saldoCentavos, usoPorcentaje, cercaDelLimite, pasaElLimite, diasVencido };
}
