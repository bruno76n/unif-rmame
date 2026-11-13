/**
 * «Cambios de esta versión»: lo que cambió en el editor contra el pedido como estaba, escrito como lo guarda la
 * bitácora: «{prenda}: talla {t} de {a} a {b}», «agregó talla {t} ({n})», «quitó talla {t} ({n})», «+{n} piezas», la
 * entrega y la forma de pago.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Pedido nuevo y Modificar pedido», «Cambios de esta versión»)
 *
 * Solo compara lo capturado con lo que se leyó: la versión, el mínimo y lo de más los revisa la acción al guardar.
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";

/** Una talla como la compara el editor. */
export interface TallaComparada {
	prenda: string;
	talla: string;
	antes: number;
	despues: number;
}

/** Cómo se lee cada forma de pago. */
const formas: Readonly<Record<string, string>> = { contado: "Contado", anticipo: "Anticipo", credito: "Crédito" };

/**
 * Los cambios de una versión, en el orden en que se leen.
 * @param tallas Cada talla con lo que tenía y lo que tiene.
 * @param entrega La entrega antes y después.
 * @param formaDePago La forma de pago antes y después.
 * @returns Una línea por cambio; vacía si nada cambió.
 */
export function cambiosDeLaVersion(
	tallas: readonly TallaComparada[],
	entrega: { antes: string; despues: string },
	formaDePago: { antes: string; despues: string },
): string[] {
	const lineas = tallas.flatMap((talla) => {
		if (talla.antes === talla.despues) return [];
		if (talla.antes === 0) return [`${talla.prenda}: agregó talla ${talla.talla} (${talla.despues})`];
		if (talla.despues === 0) return [`${talla.prenda}: quitó talla ${talla.talla} (${talla.antes})`];
		return [`${talla.prenda}: talla ${talla.talla} de ${talla.antes} a ${talla.despues}`];
	});
	const diferencia = tallas.reduce((total, talla) => total + talla.despues - talla.antes, 0);
	return [
		...lineas,
		...(diferencia === 0 ? [] : [`${diferencia > 0 ? "+" : "−"}${Math.abs(diferencia)} piezas`]),
		...(entrega.antes === entrega.despues || entrega.despues === ""
			? []
			: [`Entrega: del ${textoDeDiaCorto(entrega.antes)} al ${textoDeDiaCorto(entrega.despues)}`]),
		...(formaDePago.antes === formaDePago.despues
			? []
			: [
					`Forma de pago: de ${formas[formaDePago.antes] ?? formaDePago.antes} a ${formas[formaDePago.despues] ?? formaDePago.despues}`,
				]),
	];
}
