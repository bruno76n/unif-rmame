/**
 * La hoja del pedido (tipo `pedido`): «Pedido {PE}» y «versión {n}»; el cliente (nombre, contacto, teléfono y dirección
 * de entrega); «Para el {fecha}» y la forma de pago; la tabla Prenda · Tallas · Piezas · Precio · Importe, con las
 * tallas especiales marcadas; el total; y, si ya hubo notas, «{n} de {m} piezas entregadas».
 * Fase 20 · docs/impresos/hojas.md («El pedido»)
 *
 * Recibe todo ya escrito de Ventas.
 */

import { datosPdf, hojaPdf, type MarcoDeLaHoja, subtituloPdf, tablaPdf } from "../hoja.ts";

/** Lo que lleva la hoja de un pedido, ya escrito. */
export interface HojaDePedido {
	/** El nombre, el contacto, el teléfono y la dirección de entrega del cliente; los que no tiene, vacíos. */
	cliente: (string | null)[];
	/** «Para el 20 nov 2026». */
	para: string;
	/** «Contado», «Anticipo» o «Crédito 30 días». */
	formaDePago: string;
	/** Un renglón por prenda y precio: las tallas especiales van en el suyo, marcadas. */
	renglones: { prenda: string; tallas: string; piezas: string; precio: string; importe: string }[];
	piezas: string;
	total: string;
	/** «12 de 40 piezas entregadas», o nada si no ha habido notas. */
	entregadas: string | null;
}

/**
 * El PDF de la hoja de un pedido.
 * @param marco La empresa, el nombre, el folio, la versión y quién la sacó.
 * @param hoja Lo del pedido.
 */
export function dibujarHojaDePedido(marco: MarcoDeLaHoja, hoja: HojaDePedido): Promise<Uint8Array> {
	return hojaPdf(
		marco,
		subtituloPdf("Cliente"),
		datosPdf(...hoja.cliente),
		datosPdf(hoja.para, hoja.formaDePago),
		tablaPdf(
			[
				{ titulo: "Prenda", ancho: 5 },
				{ titulo: "Tallas", ancho: 3 },
				{ titulo: "Piezas", ancho: 1, derecha: true },
				{ titulo: "Precio", ancho: 2, derecha: true },
				{ titulo: "Importe", ancho: 2, derecha: true },
			],
			hoja.renglones.map((renglon) => [
				renglon.prenda,
				renglon.tallas,
				renglon.piezas,
				renglon.precio,
				renglon.importe,
			]),
			["Total", "", hoja.piezas, "", hoja.total],
		),
		datosPdf(hoja.entregadas),
	);
}
