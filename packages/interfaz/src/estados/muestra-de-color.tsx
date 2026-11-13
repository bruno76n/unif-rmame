/**
 * La muestra del color de un cliente: el cuadrito con el color de su escuela, como lo guarda la escuela. Sin color, el
 * gris de los que no son escuela, o nada (una tienda o la temporada).
 * Fase 19 · docs/interfaz/DISENO.md («Los colores») y docs/interfaz/fabrica/ventas.md
 *
 * El color viene de los datos (cada escuela tiene el suyo), por eso va en `style`: no es un color de la guía.
 */

import { unirClases } from "../clases.ts";

/** Los tamaños de la muestra. */
const tamanos = { chico: "size-3", mediano: "size-6", grande: "size-8" } as const;

/** Lo que recibe la muestra. */
export interface PropsDeMuestraDeColor {
	/** El color de la escuela; `null` si no tiene. */
	color: string | null;
	tamano?: keyof typeof tamanos;
	/** Qué se ve sin color: el gris (lo normal) o nada. */
	sinColor?: "gris" | "nada";
}

/**
 * La muestra de color.
 * @param props El color, el tamaño y qué se ve sin color.
 */
export function MuestraDeColor({ color, tamano = "mediano", sinColor = "gris" }: PropsDeMuestraDeColor) {
	if (color === null && sinColor === "nada") return null;
	return (
		<span
			aria-hidden="true"
			className={unirClases("inline-block flex-none rounded-chico", tamanos[tamano], color === null && "bg-pizarra")}
			style={color === null ? undefined : { backgroundColor: color }}
		/>
	);
}
