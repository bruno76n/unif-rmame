/**
 * La etiqueta de prenda (tipo `prenda`): una por pieza, con el nombre de la prenda en negritas (hasta dos renglones),
 * «{escuela o Básico} · Talla {t}», el precio de mostrador si va, «Pedido especial» si la talla lo es, y el Code 128 de
 * su código de 6 dígitos con el código debajo. En ZPL para la Zebra y en PDF de respaldo.
 * Fase 20 · docs/impresos/etiquetas.md («La etiqueta de prenda»)
 *
 * Recibe los datos ya listos de Catálogo y no decide nada: nunca recibe un costo, y el precio solo llega escrito si
 * `catalogo.etiqueta_lleva_precio` lo pide.
 */

import type { ReactElement } from "react";
import { barrasPdf, paginaPdf, renglonPdf, trabajoPdf } from "../pdf.ts";
import { recortado, recortadoConSuFinal } from "../textos.ts";
import { barrasZpl, textoZpl, trabajoZpl } from "../zpl.ts";

/** Lo que lleva una etiqueta de prenda, ya escrito. */
export interface EtiquetaDePrenda {
	/** La variante: dos etiquetas seguidas de la misma son copias. */
	varianteId: string;
	/** El nombre de la prenda. */
	prenda: string;
	/** «Instituto Juan Pablo II» o «Básico»: si no cabe, se corta con «…». */
	escuela: string;
	/** «Talla 8»: siempre completa. */
	talla: string;
	/** El código de 6 dígitos. */
	codigo: string;
	/** El precio de mostrador escrito («$450»), o nada si la etiqueta no lleva precio. */
	precio: string | null;
	pedidoEspecial: boolean;
}

/** Cuántas letras del nombre caben en dos renglones. */
const letrasDelNombre = 52;
/** Cuántas letras de «{escuela} · Talla {t}» caben en su renglón. */
const letrasDeEscuelaYTalla = 34;

/**
 * El tercer renglón: el precio y «Pedido especial», si llevan.
 * @param etiqueta La etiqueta.
 */
function renglonDelPrecio(etiqueta: EtiquetaDePrenda): string | null {
	const partes = [etiqueta.precio, etiqueta.pedidoEspecial ? "Pedido especial" : null].filter(
		(parte): parte is string => parte !== null,
	);
	return partes.length === 0 ? null : partes.join(" · ");
}

/**
 * Los campos ZPL de una etiqueta de prenda.
 * @param etiqueta La etiqueta.
 */
function camposDePrenda(etiqueta: EtiquetaDePrenda): string[] {
	const precio = renglonDelPrecio(etiqueta);
	return [
		textoZpl({
			x: 15,
			y: 10,
			alto: 26,
			texto: recortado(etiqueta.prenda, letrasDelNombre),
			bloque: { ancho: 376, renglones: 2 },
		}),
		textoZpl({
			x: 15,
			y: 66,
			alto: 22,
			texto: recortadoConSuFinal(etiqueta.escuela, etiqueta.talla, letrasDeEscuelaYTalla),
		}),
		...(precio === null ? [] : [textoZpl({ x: 15, y: 90, alto: 22, texto: precio })]),
		barrasZpl({ x: 60, y: 116, alto: 50, datos: etiqueta.codigo }),
	];
}

/**
 * La página PDF de una etiqueta de prenda.
 * @param etiqueta La etiqueta.
 * @param png Sus barras.
 */
function paginaDePrenda(etiqueta: EtiquetaDePrenda, png: Buffer): ReactElement {
	const precio = renglonDelPrecio(etiqueta);
	return paginaPdf(
		renglonPdf(recortado(etiqueta.prenda, letrasDelNombre), "negritas"),
		renglonPdf(recortadoConSuFinal(etiqueta.escuela, etiqueta.talla, letrasDeEscuelaYTalla)),
		...(precio === null ? [] : [renglonPdf(precio)]),
		barrasPdf(png, etiqueta.codigo),
	);
}

/**
 * Las etiquetas de prenda de un trabajo.
 * @param etiquetas Una por pieza, en orden.
 * @param formato ZPL para la Zebra o PDF.
 * @param copias Las copias de cada una.
 */
export function dibujarPrendas(
	etiquetas: readonly EtiquetaDePrenda[],
	formato: "zpl" | "pdf",
	copias: number,
): Promise<string | Uint8Array> {
	if (formato === "zpl") {
		return Promise.resolve(
			trabajoZpl(etiquetas, camposDePrenda, copias, (una, otra) => una.varianteId === otra.varianteId),
		);
	}
	return trabajoPdf(etiquetas, paginaDePrenda, (etiqueta) => etiqueta.codigo, copias);
}
