/**
 * La hoja del despacho (tipo `despacho`): «Despacho {D}»; el destino; «Salió el {fecha} a las {hora}» y quién despachó;
 * por cada traspaso, su folio y de qué es, con su tabla Prenda · Talla · Piezas (en el material, Material · Rollo ·
 * Metros); el total de piezas; y «Recibió», con renglones para nombre, firma, fecha y hora. Viaja con la mercancía.
 * Fase 20 · docs/impresos/hojas.md («La hoja del despacho»)
 *
 * Recibe todo ya escrito de Inventario: nunca lleva precios.
 */

import type { ReactElement } from "react";
import { datosPdf, firmasPdf, hojaPdf, type MarcoDeLaHoja, subtituloPdf, tablaPdf } from "../hoja.ts";

/** Un traspaso del despacho, con lo que lleva. */
export type TraspasoDelDespacho =
	| { titulo: string; tipo: "prendas"; renglones: { prenda: string; talla: string; piezas: string }[] }
	| { titulo: string; tipo: "material"; renglones: { material: string; rollo: string; cantidad: string }[] };

/** Lo que lleva la hoja de un despacho, ya escrito. */
export interface HojaDeDespacho {
	/** «A Tienda 1» o «A Instituto Juan Pablo II · NV-0151». */
	destino: string;
	/** «Salió el 14 nov 2026 a las 10:42 · lo despachó Marta Ruiz». */
	salio: string;
	traspasos: TraspasoDelDespacho[];
	/** «58 piezas en total». */
	total: string;
}

/**
 * La tabla de un traspaso.
 * @param traspaso El traspaso.
 */
function tablaDelTraspaso(traspaso: TraspasoDelDespacho): ReactElement {
	if (traspaso.tipo === "material") {
		return tablaPdf(
			[
				{ titulo: "Material", ancho: 4 },
				{ titulo: "Rollo", ancho: 2 },
				{ titulo: "Metros", ancho: 2, derecha: true },
			],
			traspaso.renglones.map((renglon) => [renglon.material, renglon.rollo, renglon.cantidad]),
		);
	}
	return tablaPdf(
		[
			{ titulo: "Prenda", ancho: 5 },
			{ titulo: "Talla", ancho: 1 },
			{ titulo: "Piezas", ancho: 1, derecha: true },
		],
		traspaso.renglones.map((renglon) => [renglon.prenda, renglon.talla, renglon.piezas]),
	);
}

/**
 * El PDF de la hoja de un despacho.
 * @param marco La empresa, el nombre, el folio y quién la sacó.
 * @param hoja Lo del despacho.
 */
export function dibujarHojaDeDespacho(marco: MarcoDeLaHoja, hoja: HojaDeDespacho): Promise<Uint8Array> {
	return hojaPdf(
		marco,
		datosPdf(hoja.destino, hoja.salio),
		...hoja.traspasos.flatMap((traspaso) => [subtituloPdf(traspaso.titulo), tablaDelTraspaso(traspaso)]),
		datosPdf("", hoja.total),
		firmasPdf("Recibió", ["Nombre", "Firma", "Fecha", "Hora"]),
	);
}
