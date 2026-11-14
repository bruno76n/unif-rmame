/**
 * La etiqueta de bulto (tipo `bulto`): una por bulto, al cerrar el corte, con el folio B- grande y sus barras (lo que
 * lee la tablet), «{prenda} · Talla {t}», «{n} piezas», «{lote} · bulto {n} de {total}» y «{para quién} · entrega
 * {fecha}». En ZPL para la Zebra del taller y en PDF de respaldo.
 * Fase 20 · docs/impresos/etiquetas.md («La etiqueta de bulto»)
 *
 * Recibe los datos ya escritos de Producción y no decide nada.
 */

import type { ReactElement } from "react";
import { barrasPdf, paginaPdf, renglonPdf, trabajoPdf } from "../pdf.ts";
import { recortado, recortadoConSuFinal } from "../textos.ts";
import { barrasZpl, textoZpl, trabajoZpl } from "../zpl.ts";

/** Lo que lleva la etiqueta de un bulto, ya escrito. */
export interface EtiquetaDeBulto {
	/** B-2026-121-03: lo dicen sus barras. */
	folio: string;
	/** «Pantalón azul marino»: si no cabe, se corta con «…». */
	prenda: string;
	/** «Talla 12»: siempre completa. */
	talla: string;
	/** «24 piezas». */
	piezas: string;
	/** «L-2026-121 · bulto 3 de 9». */
	lote: string;
	/** «Distribuidora Escolar Zamora · entrega 20 nov 2026». */
	paraQuien: string;
}

/** Cuántas letras de «{prenda} · Talla {t}» caben en su renglón. */
const letrasDelRenglon = 38;
/** Cuántas letras de «para quién · entrega» caben en sus dos renglones. */
const letrasDeParaQuien = 80;

/**
 * Los campos ZPL de una etiqueta de bulto.
 * @param etiqueta La etiqueta.
 */
function camposDeBulto(etiqueta: EtiquetaDeBulto): string[] {
	return [
		textoZpl({ x: 15, y: 6, alto: 30, texto: etiqueta.folio }),
		textoZpl({ x: 15, y: 40, alto: 20, texto: recortadoConSuFinal(etiqueta.prenda, etiqueta.talla, letrasDelRenglon) }),
		textoZpl({ x: 15, y: 62, alto: 18, texto: `${etiqueta.piezas} · ${etiqueta.lote}` }),
		textoZpl({
			x: 15,
			y: 82,
			alto: 18,
			texto: recortado(etiqueta.paraQuien, letrasDeParaQuien),
			bloque: { ancho: 376, renglones: 2 },
		}),
		barrasZpl({ x: 30, y: 124, alto: 44, datos: etiqueta.folio }),
	];
}

/**
 * La página PDF de una etiqueta de bulto.
 * @param etiqueta La etiqueta.
 * @param png Sus barras.
 */
function paginaDeBulto(etiqueta: EtiquetaDeBulto, png: Buffer): ReactElement {
	return paginaPdf(
		renglonPdf(etiqueta.folio, "grande"),
		renglonPdf(recortadoConSuFinal(etiqueta.prenda, etiqueta.talla, letrasDelRenglon)),
		renglonPdf(`${etiqueta.piezas} · ${etiqueta.lote}`),
		renglonPdf(recortado(etiqueta.paraQuien, letrasDeParaQuien)),
		barrasPdf(png, etiqueta.folio),
	);
}

/**
 * Las etiquetas de bulto de un trabajo.
 * @param etiquetas Una por bulto, en orden.
 * @param formato ZPL para la Zebra o PDF.
 * @param copias Las copias de cada una.
 */
export function dibujarBultos(
	etiquetas: readonly EtiquetaDeBulto[],
	formato: "zpl" | "pdf",
	copias: number,
): Promise<string | Uint8Array> {
	if (formato === "zpl") {
		return Promise.resolve(trabajoZpl(etiquetas, camposDeBulto, copias, (una, otra) => una.folio === otra.folio));
	}
	return trabajoPdf(etiquetas, paginaDeBulto, (etiqueta) => etiqueta.folio, copias);
}
