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

/**
 * Cómo se escribe una variación contra lo anterior: «▲ 51%» si subió o se quedó igual, «▼ 8%» si bajó.
 * @param actual Lo de ahora.
 * @param anterior Lo de antes.
 * @returns El texto, o `null` si antes no hubo nada contra qué comparar.
 * La usan las cifras de Dirección y las ventas de la semana de Tienda en línea.
 */
export function variacion(actual: number, anterior: number): string | null {
	if (anterior === 0) return null;
	const porciento = Math.round((actual / anterior - 1) * 100);
	return `${porciento >= 0 ? "▲" : "▼"} ${Math.abs(porciento)}%`;
}
