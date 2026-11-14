/**
 * Lo común del PDF de respaldo de las etiquetas: una página de 2 × 1 pulgadas (144 × 72 puntos) por etiqueta, con
 * Helvetica y Helvetica negrita (las que trae todo PDF, sin letras descargadas), y el Code 128 de bwip-js como imagen
 * con su texto debajo en Courier. Se imprime a tamaño real en una hoja de adheribles o en una Zebra conectada.
 * Fase 20 · docs/impresos/etiquetas.md («El PDF de respaldo»)
 *
 * Sin JSX: Node corre este archivo tal cual, así que los elementos se arman con `createElement`.
 */

import { Document, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import bwipjs from "bwip-js/node";
import { createElement as h, type ReactElement } from "react";

/** La página de una etiqueta, en puntos de PDF: 2 × 1 pulgadas. */
export const paginaDeEtiqueta: [number, number] = [144, 72];

/** Los estilos de lo que repiten todas las etiquetas. */
export const estilosDeEtiqueta = StyleSheet.create({
	pagina: { padding: 4, fontFamily: "Helvetica", fontSize: 6, color: "#000000" },
	negritas: { fontFamily: "Helvetica-Bold" },
	grande: { fontFamily: "Helvetica-Bold", fontSize: 9.5 },
	barras: { height: 15, marginTop: 1 },
	codigo: { fontFamily: "Courier", fontSize: 5.5, textAlign: "center" },
});

/**
 * Las barras de un Code 128 como imagen PNG, con su margen blanco para que un lector las lea.
 * @param datos Lo que dicen las barras: el código o el folio.
 * Existe para el PDF de respaldo: en la Zebra las barras las dibuja la impresora.
 */
export function barrasEnPng(datos: string): Promise<Buffer> {
	return bwipjs.toBuffer({
		bcid: "code128",
		text: datos,
		scale: 3,
		height: 10,
		includetext: false,
		paddingwidth: 10,
		paddingheight: 2,
		backgroundcolor: "FFFFFF",
	});
}

/**
 * Las barras y, debajo, su texto para leerlo a ojo.
 * @param png Las barras, de `barrasEnPng`.
 * @param datos Su texto.
 */
export function barrasPdf(png: Buffer, datos: string): ReactElement {
	return h(
		View,
		null,
		h(Image, { src: png, style: estilosDeEtiqueta.barras }),
		h(Text, { style: estilosDeEtiqueta.codigo }, datos),
	);
}

/**
 * Una página de etiqueta con lo suyo.
 * @param contenido Sus renglones y sus barras.
 */
export function paginaPdf(...contenido: ReactElement[]): ReactElement {
	return h(Page, { size: paginaDeEtiqueta, style: estilosDeEtiqueta.pagina }, ...contenido);
}

/**
 * Un renglón de texto de una etiqueta.
 * @param texto Lo que dice.
 * @param estilo Negritas o grande; normal si no se dice.
 */
export function renglonPdf(texto: string, estilo?: keyof typeof estilosDeEtiqueta): ReactElement {
	return h(Text, estilo === undefined ? null : { style: estilosDeEtiqueta[estilo] }, texto);
}

/**
 * El PDF de un trabajo: una página por etiqueta, en orden, y cada una tantas veces como sus copias.
 * @param etiquetas Lo de cada etiqueta, en orden.
 * @param pagina Cómo se dibuja la página de una, con sus barras ya hechas.
 * @param barras Lo que dicen las barras de una.
 * @param copias Las copias de cada una.
 */
export async function trabajoPdf<Etiqueta>(
	etiquetas: readonly Etiqueta[],
	pagina: (etiqueta: Etiqueta, png: Buffer) => ReactElement,
	barras: (etiqueta: Etiqueta) => string,
	copias: number,
): Promise<Uint8Array> {
	// Las barras de cada código se dibujan una vez, aunque se repita (las 58 playeras de una talla).
	const pngs = new Map<string, Buffer>();
	for (const etiqueta of etiquetas) {
		const datos = barras(etiqueta);
		if (!pngs.has(datos)) pngs.set(datos, await barrasEnPng(datos));
	}
	const paginas = etiquetas.flatMap((etiqueta) => {
		const png = pngs.get(barras(etiqueta));
		if (png === undefined) throw new Error("faltan las barras de una etiqueta");
		return Array.from({ length: copias }, () => pagina(etiqueta, png));
	});
	return new Uint8Array(await renderToBuffer(h(Document, null, ...paginas)));
}
