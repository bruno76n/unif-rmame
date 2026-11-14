/**
 * La hoja del lote (tipo `lote`): «Lote {L}» y «{OP}»; la prenda; «{para quién} · entrega {fecha}»; «Cortado el {fecha}
 * por {nombre}» y la versión de la receta; la tela y sus partidas; la tabla Bulto · Talla · Piezas con su total; y el
 * flujo: Orden · Operación · La hace. Acompaña a los bultos en el taller.
 * Fase 20 · docs/impresos/hojas.md («La hoja del lote»)
 *
 * Recibe todo ya escrito de Producción: nunca lleva precios, costos ni tarifas.
 */

import { datosPdf, hojaPdf, type MarcoDeLaHoja, subtituloPdf, tablaPdf } from "../hoja.ts";

/** Lo que lleva la hoja de un lote, ya escrito. */
export interface HojaDeLote {
	prenda: string;
	/** «Distribuidora Escolar Zamora · entrega 20 nov 2026». */
	paraQuien: string;
	/** «Cortado el 12 nov 2026 por Carmen Villaseñor · receta versión 3». */
	cortado: string;
	/** «Gabardina azul marino · Partida P-2224 y P-2231: el tono puede variar entre piezas». */
	tela: string;
	bultos: { folio: string; talla: string; piezas: string }[];
	/** «216 piezas». */
	totalPiezas: string;
	flujo: { orden: string; operacion: string; laHace: string }[];
}

/**
 * El PDF de la hoja de un lote.
 * @param marco La empresa, el nombre, el folio, la orden de producción y quién la sacó.
 * @param hoja Lo del lote.
 */
export function dibujarHojaDeLote(marco: MarcoDeLaHoja, hoja: HojaDeLote): Promise<Uint8Array> {
	return hojaPdf(
		marco,
		datosPdf(hoja.prenda, hoja.paraQuien, hoja.cortado, hoja.tela),
		subtituloPdf("Bultos"),
		tablaPdf(
			[
				{ titulo: "Bulto", ancho: 3 },
				{ titulo: "Talla", ancho: 2 },
				{ titulo: "Piezas", ancho: 2, derecha: true },
			],
			hoja.bultos.map((bulto) => [bulto.folio, bulto.talla, bulto.piezas]),
			["Total", "", hoja.totalPiezas],
		),
		subtituloPdf("Flujo"),
		tablaPdf(
			[
				{ titulo: "Orden", ancho: 1 },
				{ titulo: "Operación", ancho: 4 },
				{ titulo: "La hace", ancho: 4 },
			],
			hoja.flujo.map((paso) => [paso.orden, paso.operacion, paso.laHace]),
		),
	);
}
