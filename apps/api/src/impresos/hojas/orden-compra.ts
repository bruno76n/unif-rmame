/**
 * La hoja de la orden de compra (tipo `orden_compra`): «Orden de compra {OC}» y «Creada el {fecha}»; el proveedor
 * (nombre, RFC si lo tiene y teléfono); «Promete llegar el {fecha}» y la condición; la tabla Material · Cantidad ·
 * Precio · Importe con su total y «Precios sin IVA»; «Entregar en Aduana: {domicilio}»; y quién la levantó.
 * Fase 20 · docs/impresos/hojas.md («La orden de compra»)
 *
 * Recibe todo ya escrito de Compras.
 */

import { datosPdf, hojaPdf, type MarcoDeLaHoja, subtituloPdf, tablaPdf } from "../hoja.ts";

/** Lo que lleva la hoja de una orden de compra, ya escrito. */
export interface HojaDeOrden {
	proveedor: string;
	/** «RFC TAU900101AB1», o nada si no tiene. */
	rfc: string | null;
	/** «Tel. 351 512 3456». */
	telefono: string;
	/** «Promete llegar el 20 nov 2026», o nada si no promete. */
	promete: string | null;
	/** «Contado» o «Crédito 30 días». */
	condicion: string;
	lineas: { material: string; cantidad: string; precio: string; importe: string }[];
	total: string;
	/** «Entregar en Aduana: Av. Juárez 123, Zamora, Mich.». */
	entregarEn: string;
	/** «La levantó Ana Villaseñor». */
	levanto: string;
}

/**
 * El PDF de la hoja de una orden de compra.
 * @param marco La empresa, el nombre, el folio, la fecha y quién la sacó.
 * @param hoja Lo de la orden.
 */
export function dibujarOrdenDeCompra(marco: MarcoDeLaHoja, hoja: HojaDeOrden): Promise<Uint8Array> {
	return hojaPdf(
		marco,
		subtituloPdf("Proveedor"),
		datosPdf(hoja.proveedor, hoja.rfc, hoja.telefono),
		datosPdf(hoja.promete, hoja.condicion),
		tablaPdf(
			[
				{ titulo: "Material", ancho: 5 },
				{ titulo: "Cantidad", ancho: 2, derecha: true },
				{ titulo: "Precio", ancho: 2, derecha: true },
				{ titulo: "Importe", ancho: 2, derecha: true },
			],
			hoja.lineas.map((linea) => [linea.material, linea.cantidad, linea.precio, linea.importe]),
			["Total", "", "", hoja.total],
		),
		datosPdf("Precios sin IVA"),
		datosPdf(hoja.entregarEn, hoja.levanto),
	);
}
