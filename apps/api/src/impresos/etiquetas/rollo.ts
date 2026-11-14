/**
 * La etiqueta de rollo (tipo `rollo`): una por rollo, con el folio R- grande y sus barras, la tela, «Partida {P} ·
 * {código del proveedor}» (o «Sin partida»), sus metros al recibirlo y «{proveedor} · {fecha}» (o «Carga inicial»). Si
 * el rollo quedó como retazo sale la del retazo: «Retazo», el folio RZ- grande y sus barras, «del {R-}», la tela y su
 * partida, sus metros y «Corte {lote} · {fecha}». En ZPL para la Zebra y en PDF de respaldo.
 * Fase 20 · docs/impresos/etiquetas.md («La etiqueta de rollo y la de retazo»)
 *
 * Recibe los datos ya escritos de Inventario y no decide nada: nunca recibe un costo.
 */

import type { ReactElement } from "react";
import { barrasPdf, paginaPdf, renglonPdf, trabajoPdf } from "../pdf.ts";
import { recortado } from "../textos.ts";
import { barrasZpl, textoZpl, trabajoZpl } from "../zpl.ts";

/** Lo que lleva la etiqueta de un rollo, ya escrito. */
export interface EtiquetaDeRollo {
	tipo: "rollo";
	/** R-0431: lo dicen sus barras. */
	folio: string;
	tela: string;
	/** «Partida P-2224 · 7731-B» o «Sin partida». */
	partida: string;
	/** «92 m». */
	metros: string;
	/** «Textiles Aurora · 7 nov 2026» o «Carga inicial». */
	origen: string;
}

/** Lo que lleva la etiqueta de un retazo, ya escrito. */
export interface EtiquetaDeRetazo {
	tipo: "retazo";
	/** RZ-012: lo dicen sus barras. */
	folio: string;
	/** «del R-0431». */
	delRollo: string;
	/** «Gabardina azul marino · Partida P-2224». */
	telaYPartida: string;
	/** «14.5 m». */
	metros: string;
	/** «Corte L-2026-121 · 12 nov 2026». */
	corte: string;
}

/** La etiqueta de un rollo o, si quedó como retazo, la del retazo. */
export type EtiquetaDeMaterial = EtiquetaDeRollo | EtiquetaDeRetazo;

/** Cuántas letras de la tela caben en su renglón. */
const letrasDeLaTela = 30;

/**
 * Los campos ZPL de una etiqueta de rollo o de retazo.
 * @param etiqueta La etiqueta.
 */
function camposDeMaterial(etiqueta: EtiquetaDeMaterial): string[] {
	if (etiqueta.tipo === "retazo") {
		return [
			textoZpl({ x: 15, y: 8, alto: 22, texto: "Retazo" }),
			textoZpl({ x: 15, y: 30, alto: 34, texto: etiqueta.folio }),
			textoZpl({ x: 230, y: 38, alto: 22, texto: etiqueta.delRollo }),
			textoZpl({ x: 15, y: 66, alto: 22, texto: recortado(etiqueta.telaYPartida, letrasDeLaTela + 20) }),
			textoZpl({ x: 15, y: 90, alto: 22, texto: `${etiqueta.metros} · ${etiqueta.corte}` }),
			barrasZpl({ x: 40, y: 116, alto: 50, datos: etiqueta.folio }),
		];
	}
	return [
		textoZpl({ x: 15, y: 8, alto: 40, texto: etiqueta.folio }),
		textoZpl({ x: 260, y: 16, alto: 30, texto: etiqueta.metros }),
		textoZpl({ x: 15, y: 52, alto: 22, texto: recortado(etiqueta.tela, letrasDeLaTela) }),
		textoZpl({ x: 15, y: 74, alto: 20, texto: etiqueta.partida }),
		textoZpl({ x: 15, y: 96, alto: 20, texto: etiqueta.origen }),
		barrasZpl({ x: 40, y: 120, alto: 46, datos: etiqueta.folio }),
	];
}

/**
 * La página PDF de una etiqueta de rollo o de retazo.
 * @param etiqueta La etiqueta.
 * @param png Sus barras.
 */
function paginaDeMaterial(etiqueta: EtiquetaDeMaterial, png: Buffer): ReactElement {
	if (etiqueta.tipo === "retazo") {
		return paginaPdf(
			renglonPdf(`Retazo ${etiqueta.folio} · ${etiqueta.delRollo}`, "negritas"),
			renglonPdf(recortado(etiqueta.telaYPartida, letrasDeLaTela + 20)),
			renglonPdf(`${etiqueta.metros} · ${etiqueta.corte}`),
			barrasPdf(png, etiqueta.folio),
		);
	}
	return paginaPdf(
		renglonPdf(`${etiqueta.folio} · ${etiqueta.metros}`, "grande"),
		renglonPdf(recortado(etiqueta.tela, letrasDeLaTela)),
		renglonPdf(`${etiqueta.partida} · ${etiqueta.origen}`),
		barrasPdf(png, etiqueta.folio),
	);
}

/**
 * Las etiquetas de rollo y de retazo de un trabajo.
 * @param etiquetas Una por rollo, en orden.
 * @param formato ZPL para la Zebra o PDF.
 * @param copias Las copias de cada una.
 */
export function dibujarRollos(
	etiquetas: readonly EtiquetaDeMaterial[],
	formato: "zpl" | "pdf",
	copias: number,
): Promise<string | Uint8Array> {
	if (formato === "zpl") {
		return Promise.resolve(trabajoZpl(etiquetas, camposDeMaterial, copias, (una, otra) => una.folio === otra.folio));
	}
	return trabajoPdf(etiquetas, paginaDeMaterial, (etiqueta) => etiqueta.folio, copias);
}
