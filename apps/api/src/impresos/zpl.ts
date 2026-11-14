/**
 * Lo común del ZPL de las etiquetas de las Zebra ZD421 de 203 ppp: la etiqueta de 2 × 1 pulgadas (406 × 203 puntos)
 * con `^CI28` para los acentos y la ñ, el texto con la letra escalable de la impresora (`^A0N`), los bloques que cortan
 * en renglones (`^FB`), el Code 128 que dibuja la impresora (`^BC`, con su texto abajo), y las copias con `^PQ`.
 * Fase 20 · docs/impresos/etiquetas.md («El ZPL»)
 *
 * Lo que viene de los datos pasa por `^FH` con `_` de indicador: un `^`, un `~` o un `_` en el nombre de una prenda se
 * mandan en hexadecimal y no rompen la etiqueta.
 */

/** El ancho de la etiqueta en puntos: 2 pulgadas a 203 ppp. */
export const anchoDeEtiqueta = 406;
/** El alto de la etiqueta en puntos: 1 pulgada a 203 ppp. */
export const altoDeEtiqueta = 203;

/**
 * Un dato escrito para `^FH`: `_`, `^` y `~` en hexadecimal con `_` delante, lo demás tal cual (en UTF-8, por `^CI28`).
 * @param texto El dato.
 */
export function datoZpl(texto: string): string {
	return texto.replace(/[_^~]/g, (caracter) => `_${caracter.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Un texto en la etiqueta. */
export interface TextoZpl {
	x: number;
	y: number;
	/** El alto de la letra, en puntos. */
	alto: number;
	texto: string;
	/** Para cortar en renglones: el ancho del bloque, en puntos, y cuántos renglones caben. */
	bloque?: { ancho: number; renglones: number };
}

/**
 * Un texto con la letra escalable de la impresora, y en bloque si puede no caber.
 * @param texto Dónde va, su alto, el dato y su bloque.
 */
export function textoZpl({ x, y, alto, texto, bloque }: TextoZpl): string {
	const enBloque = bloque === undefined ? "" : `^FB${bloque.ancho},${bloque.renglones},0,L,0`;
	return `^FO${x},${y}^A0N,${alto},${alto}${enBloque}^FH^FD${datoZpl(texto)}^FS`;
}

/**
 * Un Code 128 en modo automático, con su texto abajo, que dibuja la impresora.
 * @param barras Dónde va, el alto de las barras y lo que dicen.
 */
export function barrasZpl({ x, y, alto, datos }: { x: number; y: number; alto: number; datos: string }): string {
	return `^FO${x},${y}^BY2^BCN,${alto},Y,N,N,A^FH^FD${datoZpl(datos)}^FS`;
}

/**
 * Una etiqueta completa, de `^XA` a `^XZ`.
 * @param campos Sus textos y sus barras, ya escritos.
 * @param copias Cuántas iguales: van con `^PQ`, no repetidas.
 */
export function etiquetaZpl(campos: readonly string[], copias: number): string {
	return `^XA^CI28^PW${anchoDeEtiqueta}^LL${altoDeEtiqueta}${campos.join("")}^PQ${copias}^XZ`;
}

/**
 * Un trabajo: todas sus etiquetas en un solo ZPL, en el orden en que se piden. Las iguales seguidas (las 58 playeras
 * de una talla) van en una sola etiqueta con sus copias.
 * @param etiquetas Lo de cada etiqueta, en orden.
 * @param campos Cómo se dibuja una.
 * @param copias Las copias de cada una.
 * @param igual Si dos etiquetas seguidas son la misma.
 */
export function trabajoZpl<Etiqueta>(
	etiquetas: readonly Etiqueta[],
	campos: (etiqueta: Etiqueta) => readonly string[],
	copias: number,
	igual: (una: Etiqueta, otra: Etiqueta) => boolean,
): string {
	const grupos: { etiqueta: Etiqueta; cuantas: number }[] = [];
	for (const etiqueta of etiquetas) {
		const ultimo = grupos.at(-1);
		if (ultimo !== undefined && igual(ultimo.etiqueta, etiqueta)) ultimo.cuantas += 1;
		else grupos.push({ etiqueta, cuantas: 1 });
	}
	return grupos.map(({ etiqueta, cuantas }) => etiquetaZpl(campos(etiqueta), cuantas * copias)).join("\n");
}
