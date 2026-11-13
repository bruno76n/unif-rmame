/**
 * Las cuentas de un pedido y de una nota de Ventas a externos que la pantalla corre mientras se escribe y la API
 * repite al guardar: el precio unitario de una talla, el total de unos renglones y el anticipo que se aplica a una
 * nota.
 * Fase 16 · docs/modulos/ventas/pedidos.md (regla 3) y docs/modulos/ventas/notas-de-entrega.md (regla 2)
 * Fase 19 · docs/interfaz/fabrica/ventas.md (los totales del editor y de «Armar nota»)
 *
 * Puras y en centavos enteros: así lo que la pantalla muestra es lo que la acción guarda.
 */

/**
 * El precio unitario de una talla: el dado por Ventas, o el sugerido, más el recargo de una talla especial.
 * @param baseCentavos El precio dado o el sugerido.
 * @param recargoCentavos El recargo de la talla.
 */
export function precioUnitario(baseCentavos: number, recargoCentavos: number): number {
	return baseCentavos + recargoCentavos;
}

/**
 * El total de unos renglones: piezas por su precio unitario.
 * @param renglones Los renglones.
 */
export function totalDe(renglones: readonly { cantidad: number; precioUnitarioCentavos: number }[]): number {
	return renglones.reduce((total, renglon) => total + renglon.cantidad * renglon.precioUnitarioCentavos, 0);
}

/**
 * El anticipo que se aplica a una nota: lo menor entre lo disponible del pedido y el subtotal, nunca negativo.
 * @param disponibleCentavos Lo que queda del anticipo del pedido.
 * @param subtotalCentavos El subtotal de la nota.
 */
export function anticipoAplicado(disponibleCentavos: number, subtotalCentavos: number): number {
	return Math.max(0, Math.min(disponibleCentavos, subtotalCentavos));
}
