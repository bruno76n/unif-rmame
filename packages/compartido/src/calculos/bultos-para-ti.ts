/**
 * «Bultos para ti»: los bultos que la tablet le propone a una persona, de los lotes en proceso, en las operaciones que
 * hace de base.
 * Fase 12 · docs/modulos/produccion/registros-de-operacion.md («Lo que baja a la tablet», «Bultos para ti»)
 *
 * Pura: la tablet la calcula sin internet con lo que le bajó. Primero los atorados y atrasados, luego en riesgo, por
 * fecha de entrega y por el orden del bulto, hasta `produccion.bultos_para_ti_max`.
 */

import { Temporal } from "temporal-polyfill";
import type { DiaNegocio } from "../tipos/base.ts";
import type { SaludDeLote } from "./salud-lote.ts";

/** Un bulto que puede ir en la lista: el tope en la operación de la persona, la salud y la entrega de su lote. */
export interface BultoCandidato {
	bultoId: string;
	/** El número del bulto dentro de su lote: el orden. */
	numero: number;
	/** El tope del bulto en la operación que la persona hace de base; cero, no hay qué hacer. */
	tope: number;
	salud: SaludDeLote["tipo"];
	fechaEntrega: DiaNegocio;
}

/** El grupo de cada salud: primero lo atorado y atrasado, luego en riesgo, luego lo demás. */
function grupo(salud: SaludDeLote["tipo"]): number {
	if (salud === "atorado" || salud === "atorado_maquina" || salud === "atrasado") return 0;
	return salud === "en_riesgo" ? 1 : 2;
}

/**
 * Los bultos para una persona.
 * @param candidatos Los bultos de los lotes en proceso en sus operaciones de base, con su tope.
 * @param maximo `produccion.bultos_para_ti_max`.
 * @returns Los primeros, en su orden.
 */
export function bultosParaTi(candidatos: readonly BultoCandidato[], maximo: number): BultoCandidato[] {
	return candidatos
		.filter((bulto) => bulto.tope > 0)
		.sort(
			(uno, otro) =>
				grupo(uno.salud) - grupo(otro.salud) ||
				Temporal.PlainDate.compare(uno.fechaEntrega, otro.fechaEntrega) ||
				uno.numero - otro.numero ||
				uno.bultoId.localeCompare(otro.bultoId),
		)
		.slice(0, Math.max(0, maximo));
}
