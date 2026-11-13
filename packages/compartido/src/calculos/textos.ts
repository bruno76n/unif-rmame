/**
 * Las piezas de texto que repiten las consultas y las pantallas: una cifra con su palabra en singular o en plural.
 * Fase 19 · docs/interfaz/TEXTOS.md (las cifras y sus palabras)
 */

/** El separador de miles de México, sin decimales. */
const enteros = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });

/**
 * Una cifra con su palabra: «1 lote», «3 lotes», «1,250 piezas».
 * @param cuantos La cifra.
 * @param uno La palabra en singular.
 * @param varios La palabra en plural.
 */
export function plural(cuantos: number, uno: string, varios: string): string {
	return `${enteros.format(cuantos)} ${cuantos === 1 ? uno : varios}`;
}
