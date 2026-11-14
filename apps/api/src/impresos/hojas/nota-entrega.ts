/**
 * La hoja de la nota de entrega (tipo `nota_entrega`): «Nota de entrega {NV}» y, debajo del folio, «Nota {i} de {n} del pedido {PE}»; el
 * cliente y su dirección de entrega; armada y, si ya salió, «Salió el {fecha} con {D}»; la tabla por talla; y abajo
 * «Recibí completo» con nombre, firma y fecha. Con precios, la tabla lleva Precio e Importe y debajo van el subtotal, el
 * anticipo aplicado, las notas de crédito, «Por cobrar», la forma de pago y, a crédito ya entregada, «Vence el
 * {fecha}»; sin precios, nada de eso.
 * Fase 20 · docs/impresos/hojas.md («La nota de entrega»)
 *
 * Recibe todo ya escrito de Ventas: lo que la cuenta no ve ni siquiera le llega.
 */

import { datosPdf, firmasPdf, hojaPdf, type MarcoDeLaHoja, subtituloPdf, tablaPdf } from "../hoja.ts";

/** Lo de dinero de una nota, ya escrito; solo para quien ve precios. */
export interface DineroDeLaNota {
	/** El precio y el importe de cada renglón, en el orden de los renglones. */
	precios: { precio: string; importe: string }[];
	/** «$4,560»: va en el Importe del renglón «Total». */
	subtotal: string;
	/** «Subtotal $4,560», «Anticipo aplicado -$1,000», «Nota de crédito NC-0012 -$480», «Por cobrar $3,080». */
	cuentas: string[];
	/** «Crédito 30 días · Vence el 14 dic 2026», o la forma de pago sola. */
	formaDePago: string;
}

/** Lo que lleva la hoja de una nota de entrega, ya escrito. */
export interface HojaDeNota {
	cliente: string;
	direccion: string;
	/** «Armada el 12 nov 2026» y, si salió, «Salió el 13 nov 2026 con D-0414». */
	cuando: (string | null)[];
	renglones: { prenda: string; talla: string; piezas: string }[];
	piezas: string;
	/** Lo de dinero, o nada para quien no ve precios. */
	dinero: DineroDeLaNota | null;
}

/**
 * La tabla de la nota: con Precio e Importe para quien los ve.
 * @param hoja Lo de la nota.
 */
function tablaDeLaNota(hoja: HojaDeNota) {
	const columnas = [
		{ titulo: "Prenda", ancho: 5 },
		{ titulo: "Talla", ancho: 1 },
		{ titulo: "Piezas", ancho: 1, derecha: true },
	];
	const { dinero } = hoja;
	if (dinero === null) {
		return tablaPdf(
			columnas,
			hoja.renglones.map((renglon) => [renglon.prenda, renglon.talla, renglon.piezas]),
			["Total", "", hoja.piezas],
		);
	}
	return tablaPdf(
		[...columnas, { titulo: "Precio", ancho: 2, derecha: true }, { titulo: "Importe", ancho: 2, derecha: true }],
		hoja.renglones.map((renglon, i) => [
			renglon.prenda,
			renglon.talla,
			renglon.piezas,
			dinero.precios[i]?.precio ?? "",
			dinero.precios[i]?.importe ?? "",
		]),
		["Total", "", hoja.piezas, "", dinero.subtotal],
	);
}

/**
 * El PDF de la hoja de una nota de entrega.
 * @param marco La empresa, el nombre, el folio, «Nota {i} de {n} del pedido {PE}» y quién la sacó.
 * @param hoja Lo de la nota, con o sin precios.
 */
export function dibujarHojaDeNota(marco: MarcoDeLaHoja, hoja: HojaDeNota): Promise<Uint8Array> {
	return hojaPdf(
		marco,
		subtituloPdf("Cliente"),
		datosPdf(hoja.cliente, hoja.direccion),
		datosPdf(...hoja.cuando),
		tablaDeLaNota(hoja),
		...(hoja.dinero === null ? [] : [datosPdf(...hoja.dinero.cuentas), datosPdf(hoja.dinero.formaDePago)]),
		firmasPdf("Recibí completo", ["Nombre", "Firma", "Fecha"]),
	);
}
