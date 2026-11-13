/**
 * Las unidades en que se captura un material en una receta y su conversión a la unidad de inventario: 1 si es la misma
 * (`m` o `pza`), 100 de centímetros a metros, o el factor de receta del material. Es la única regla: la usan
 * `patronaje.guardar_receta` (que congela la conversión en la línea) y `patronaje.receta` (que ofrece en la pantalla la
 * unidad en que se captura cada material).
 * Fase 10 · docs/modulos/patronaje/recetas.md (las unidades de la receta)
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («La página de la receta»)
 */

/** Las unidades en que se captura una receta. */
export const unidadesDeCaptura = ["m", "cm", "pza"] as const;

/** Una unidad de captura. */
export type UnidadDeCaptura = (typeof unidadesDeCaptura)[number];

/** Lo que dice un material de sus unidades. */
export interface UnidadesDelMaterial {
	/** Su unidad de inventario. */
	unidad: string;
	/** La unidad en que lo pide su receta, si tiene una propia. */
	unidadReceta: string | null;
	/** Cuántas de su unidad de receta hay en una de inventario. */
	factorReceta: string | null;
}

/**
 * La conversión de una unidad de captura a la de inventario del material.
 * @param material Sus unidades.
 * @param unidad La unidad en que se captura.
 * @returns La conversión con tres decimales, o nada si el material no acepta esa unidad.
 */
export function conversionDeCaptura(material: UnidadesDelMaterial, unidad: string): string | undefined {
	if (unidad === material.unidad && (unidad === "m" || unidad === "pza")) return "1.000";
	if (unidad === "cm" && material.unidad === "m") return "100.000";
	if (unidad === material.unidadReceta && material.factorReceta !== null) return material.factorReceta;
	return undefined;
}

/**
 * Las unidades en que se puede capturar un material.
 * @param material Sus unidades.
 */
export function unidadesQueAcepta(material: UnidadesDelMaterial): UnidadDeCaptura[] {
	return unidadesDeCaptura.filter((unidad) => conversionDeCaptura(material, unidad) !== undefined);
}

/**
 * La unidad en que se ofrece capturar un material: la de su receta si la acepta, o si no, su unidad de inventario.
 * @param material Sus unidades.
 * @returns La unidad y su conversión, o nada si no se captura en `m`, `cm` ni `pza`.
 */
export function unidadParaCapturar(
	material: UnidadesDelMaterial,
): { unidad: UnidadDeCaptura; conversion: string } | undefined {
	const preferidas = [material.unidadReceta, material.unidad];
	for (const unidad of unidadesDeCaptura
		.filter((una) => preferidas.includes(una))
		.sort((una, otra) => preferidas.indexOf(una) - preferidas.indexOf(otra))) {
		const conversion = conversionDeCaptura(material, unidad);
		if (conversion !== undefined) return { unidad, conversion };
	}
	return undefined;
}
