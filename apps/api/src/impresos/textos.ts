/**
 * Lo que comparten los dos formatos de una etiqueta al escribir sus textos.
 * Fase 20 · docs/impresos/etiquetas.md («La etiqueta de prenda»: lo que no cabe se corta con «…»)
 */

/**
 * Un texto cortado con «…» si no cabe: el nombre largo de una prenda. El ZPL y el PDF cortan igual.
 * @param texto El texto.
 * @param maximo Cuántas letras caben.
 */
export function recortado(texto: string, maximo: number): string {
	return texto.length <= maximo ? texto : `${texto.slice(0, maximo - 1).trimEnd()}…`;
}
