/**
 * El avance de un pedido por talla, su etapa y su alerta.
 * Fase 16 · docs/modulos/ventas/pedidos.md («El avance, la etapa y la alerta»)
 *
 * Son funciones puras: reciben lo que dan las lecturas de Inventario (lo listo, lo de Bodega) y de Producción (lo que
 * está en producción) y lo de las notas del pedido. Las usan `ventas.avance_pedido`, guardar una versión, mandar a
 * producción y las consultas de Ventas (fase 19).
 */

import { Temporal } from "temporal-polyfill";

/** Lo que se sabe de una talla de un pedido. */
export interface TallaDelPedido {
	varianteId: string;
	/** La cantidad vigente. */
	pedido: number;
	/** Lo de sus notas entregadas. */
	entregado: number;
	/** Lo de sus notas por despachar y en camino. */
	enNota: number;
	/** Lo listo en Aduana sin nota. */
	listo: number;
	/** Lo apartado en Bodega o en camino a aduana para el pedido. */
	deBodega: number;
	/** Lo de sus lotes y sus reprocesos. */
	enProduccion: number;
}

/** Las cuentas del avance de una talla. */
export interface AvanceDeTalla extends TallaDelPedido {
	/** Pedido − entregado − en nota − listo − de bodega, nunca menos de 0. */
	falta: number;
	/** Lo que falta − en producción, si es más de 0. */
	porMandar: number;
	/** En producción − lo que falta, si es más de 0. */
	deMas: number;
}

/** La etapa de un pedido confirmado. */
export type Etapa = "confirmado" | "entrega_parcial" | "listo_en_aduana" | "en_produccion";

/** La alerta de un pedido: la primera que aplica. */
export type Alerta =
	| { tipo: "atrasado" }
	| { tipo: "listo_para_entregar" }
	| { tipo: "por_mandar"; piezas: number; conOrden: boolean }
	| { tipo: "en_riesgo" }
	| { tipo: "cambio_por_aplicar" };

/**
 * Las cuentas del avance de una talla.
 * @param talla Lo que se sabe de ella.
 */
export function avanceDeTalla(talla: TallaDelPedido): AvanceDeTalla {
	const falta = Math.max(0, talla.pedido - talla.entregado - talla.enNota - talla.listo - talla.deBodega);
	return {
		...talla,
		falta,
		porMandar: Math.max(0, falta - talla.enProduccion),
		deMas: Math.max(0, talla.enProduccion - falta),
	};
}

/**
 * La etapa de un pedido confirmado: «Confirmado» si no se ha mandado ni surtido nada; «Entrega parcial» con algo
 * entregado o en nota; «Listo en aduana» si todo lo que falta está listo; si no, «En producción».
 * @param tallas El avance de sus tallas.
 */
export function etapaDelPedido(tallas: readonly AvanceDeTalla[]): Etapa {
	const suma = (cuenta: (talla: AvanceDeTalla) => number) => tallas.reduce((total, talla) => total + cuenta(talla), 0);
	if (suma((talla) => talla.entregado + talla.enNota + talla.listo + talla.deBodega + talla.enProduccion) === 0) {
		return "confirmado";
	}
	if (suma((talla) => talla.entregado + talla.enNota) > 0) return "entrega_parcial";
	if (tallas.every((talla) => talla.listo >= talla.pedido - talla.entregado)) return "listo_en_aduana";
	return "en_produccion";
}

/** Lo demás que pide la alerta. */
export interface DatosDeLaAlerta {
	fechaEntrega: string;
	hoy: Temporal.PlainDate;
	/** `ventas.dias_en_riesgo`. */
	diasEnRiesgo: number;
	/** Si el pedido ya tiene alguna orden de producción. */
	conOrden: boolean;
	/** Si Producción no ha aplicado un cambio suyo. */
	cambioPorAplicar: boolean;
}

/**
 * La alerta de un pedido: la primera que aplique, o ninguna.
 * @param tallas El avance de sus tallas.
 * @param datos La fecha de entrega, hoy, el parámetro y lo que dice Producción.
 */
export function alertaDelPedido(tallas: readonly AvanceDeTalla[], datos: DatosDeLaAlerta): Alerta | null {
	const suma = (cuenta: (talla: AvanceDeTalla) => number) => tallas.reduce((total, talla) => total + cuenta(talla), 0);
	const dias = datos.hoy.until(Temporal.PlainDate.from(datos.fechaEntrega), { largestUnit: "days" }).days;
	if (dias < 0) return { tipo: "atrasado" };
	if (suma((talla) => talla.listo) > 0) return { tipo: "listo_para_entregar" };
	const porMandar = suma((talla) => talla.porMandar);
	if (porMandar > 0) return { tipo: "por_mandar", piezas: porMandar, conOrden: datos.conOrden };
	const faltaEntregar = suma((talla) => talla.pedido - talla.entregado);
	if (dias <= datos.diasEnRiesgo && suma((talla) => talla.listo + talla.enNota) < faltaEntregar) {
		return { tipo: "en_riesgo" };
	}
	if (datos.cambioPorAplicar) return { tipo: "cambio_por_aplicar" };
	return null;
}
