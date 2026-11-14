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

/** Una talla con el nombre de su grupo, como la piden los rangos de tallas. */
export interface TallaConGrupo {
	grupo: string;
	talla: string;
}

/**
 * El rango de tallas de una prenda, por grupo: «6 a 14», «4 a 16 y CH a XG»; un grupo de una sola talla la dice sola.
 * @param tallas Sus tallas, ya en el orden de su grupo y de su lugar en él (`ordenDeTallas`).
 * @returns El rango, o vacío sin tallas.
 * Es el único rango de tallas: lo escriben las consultas de Catálogo, Patronaje y Ventas a externos.
 */
export function rangoDeTallas(tallas: readonly TallaConGrupo[]): string {
	const grupos = new Map<string, string[]>();
	for (const { grupo, talla } of tallas) grupos.set(grupo, [...(grupos.get(grupo) ?? []), talla]);
	const partes = [...grupos.values()].map((delGrupo) =>
		delGrupo.length === 1 ? (delGrupo[0] ?? "") : `${delGrupo[0]} a ${delGrupo.at(-1)}`,
	);
	return partes.length <= 1 ? (partes[0] ?? "") : `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}`;
}
