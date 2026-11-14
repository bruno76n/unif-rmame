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

/**
 * «{principio} · {final}» en un renglón, cortando solo el principio con «…» si no cabe: el final (la talla, la
 * partida) nunca se pierde, porque es lo que distingue una etiqueta de la de junto.
 * @param principio Lo que se puede cortar: la prenda, la escuela o la tela.
 * @param final Lo que siempre va completo: «Talla 12», «Partida P-2224».
 * @param maximo Cuántas letras caben en el renglón.
 */
export function recortadoConSuFinal(principio: string, final: string, maximo: number): string {
	const separador = " · ";
	return `${recortado(principio, Math.max(1, maximo - final.length - separador.length))}${separador}${final}`;
}
