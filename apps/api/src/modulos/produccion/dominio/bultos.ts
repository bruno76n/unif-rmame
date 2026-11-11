/**
 * Los bultos de un lote: por talla con piezas, el mínimo de bultos de hasta `produccion.bulto_max_piezas`, lo más
 * parejos posible, numerados desde 1 en el orden de las tallas.
 * Fase 12 · docs/modulos/produccion/corte-y-bultos.md (regla 10)
 *
 * Puro: el servidor arma los bultos al cerrar el corte. El folio es B-{año del lote}-{número del lote}-{n, dos cifras}.
 */

/** Un bulto por armar. */
export interface BultoArmado {
	varianteId: string;
	numero: number;
	piezas: number;
}

/**
 * Arma los bultos de un lote.
 * @param tallas Las piezas cortadas por talla, en el orden de las tallas.
 * @param maximo Lo más que lleva un bulto.
 * @returns Los bultos, numerados desde 1.
 */
export function armarBultos(tallas: readonly { varianteId: string; piezas: number }[], maximo: number): BultoArmado[] {
	const bultos: BultoArmado[] = [];
	for (const { varianteId, piezas } of tallas) {
		if (piezas <= 0) continue;
		const cuantos = Math.ceil(piezas / maximo);
		const base = Math.floor(piezas / cuantos);
		const conUnaMas = piezas % cuantos;
		for (let i = 0; i < cuantos; i++) {
			bultos.push({ varianteId, numero: bultos.length + 1, piezas: base + (i < conUnaMas ? 1 : 0) });
		}
	}
	return bultos;
}

/**
 * El folio de un bulto: B-2026-121-03 es el bulto 3 del L-2026-121.
 * @param folioLote El folio del lote (L-{año}-{n}).
 * @param numero El número del bulto.
 */
export function folioDeBulto(folioLote: string, numero: number): string {
	return `B-${folioLote.replace(/^L-/, "")}-${String(numero).padStart(2, "0")}`;
}
