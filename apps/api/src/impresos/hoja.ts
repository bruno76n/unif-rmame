/**
 * Lo común de las hojas en PDF: tamaño carta, vertical, con márgenes de 1.5 cm y Helvetica de 10 puntos (sus títulos
 * en negritas, sin letras descargadas). Arriba, la empresa a la izquierda (el nombre comercial en negritas, la razón
 * social, el RFC y el domicilio) y a la derecha el nombre de la hoja, su folio grande y su fecha. Abajo, en todas,
 * «Hoja {n} de {total}» y «Sacada el {fecha} a las {hora} por {nombre}». Una tabla que no cabe sigue en la hoja
 * siguiente con su encabezado.
 * Fase 20 · docs/impresos/hojas.md («Reglas»)
 *
 * Recibe todo ya escrito: no consulta ni decide nada. Sin JSX: Node corre este archivo tal cual, así que los elementos
 * se arman con `createElement`.
 */

import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { createElement as h, type ReactElement } from "react";

/** 1.5 cm en puntos de PDF. */
const margen = 42.5;

/** Los estilos de lo que repiten todas las hojas. */
const estilos = StyleSheet.create({
	pagina: {
		paddingTop: margen,
		paddingHorizontal: margen,
		paddingBottom: margen + 24,
		fontFamily: "Helvetica",
		fontSize: 10,
		color: "#15161B",
	},
	encabezado: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
	empresa: { maxWidth: 300, fontSize: 9, color: "#3C3F48" },
	marca: { fontFamily: "Helvetica-Bold", fontSize: 12, color: "#15161B", marginBottom: 2 },
	titulo: { alignItems: "flex-end" },
	nombreDeHoja: { fontFamily: "Helvetica-Bold", fontSize: 11 },
	folio: { fontFamily: "Helvetica-Bold", fontSize: 20, marginVertical: 2 },
	pie: {
		position: "absolute",
		left: margen,
		right: margen,
		bottom: margen - 12,
		flexDirection: "row",
		justifyContent: "space-between",
		fontSize: 8,
		color: "#6B6F7A",
	},
	negritas: { fontFamily: "Helvetica-Bold" },
	subtitulo: { fontFamily: "Helvetica-Bold", fontSize: 11, marginTop: 12, marginBottom: 4 },
	renglon: { marginBottom: 2 },
	tabla: { marginTop: 6, borderTopWidth: 1, borderColor: "#15161B" },
	fila: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#C9CCD4", paddingVertical: 3 },
	filaTitulos: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#15161B", paddingVertical: 3 },
	filaTotal: { flexDirection: "row", paddingVertical: 4 },
	celda: { paddingHorizontal: 3 },
	firmas: { marginTop: 28 },
	lineaDeFirma: { flexDirection: "row", marginTop: 18 },
	raya: { flexGrow: 1, borderBottomWidth: 0.75, borderColor: "#15161B", marginLeft: 6 },
});

/** Los datos de la empresa del encabezado. */
export interface EmpresaDeLaHoja {
	nombreComercial: string;
	razonSocial: string;
	rfc: string;
	domicilio: string;
}

/** Lo que lleva toda hoja, además de su contenido. */
export interface MarcoDeLaHoja {
	empresa: EmpresaDeLaHoja;
	/** «Orden de compra», «Nota de entrega»… */
	nombre: string;
	/** El folio grande: «OC-0225». */
	folio: string;
	/** Debajo del folio: «Creada el 7 nov 2026», «versión 2». */
	fecha: string;
	/** «Sacada el 14 nov 2026 a las 10:42 por Ana Villaseñor». */
	sacada: string;
}

/**
 * Una hoja completa en PDF.
 * @param marco Lo de toda hoja: la empresa, su nombre, su folio, su fecha y quién la sacó.
 * @param contenido Lo suyo, en orden: datos, tablas, firmas.
 */
export async function hojaPdf(marco: MarcoDeLaHoja, ...contenido: ReactElement[]): Promise<Uint8Array> {
	const encabezado = h(
		View,
		{ style: estilos.encabezado },
		h(
			View,
			{ style: estilos.empresa },
			h(Text, { style: estilos.marca }, marco.empresa.nombreComercial),
			h(Text, null, marco.empresa.razonSocial),
			h(Text, null, `RFC ${marco.empresa.rfc}`),
			h(Text, null, marco.empresa.domicilio),
		),
		h(
			View,
			{ style: estilos.titulo },
			h(Text, { style: estilos.nombreDeHoja }, marco.nombre),
			h(Text, { style: estilos.folio }, marco.folio),
			h(Text, null, marco.fecha),
		),
	);
	const pie = h(
		View,
		{ style: estilos.pie, fixed: true },
		h(Text, {
			render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
				`Hoja ${pageNumber} de ${totalPages}`,
		}),
		h(Text, null, marco.sacada),
	);
	const pagina = h(Page, { size: "LETTER", style: estilos.pagina }, encabezado, ...contenido, pie);
	return new Uint8Array(await renderToBuffer(h(Document, { title: `${marco.nombre} ${marco.folio}` }, pagina)));
}

/**
 * Unos renglones de datos, uno debajo del otro.
 * @param renglones Lo que dice cada uno; los vacíos no salen.
 */
export function datosPdf(...renglones: (string | null)[]): ReactElement {
	return h(
		View,
		{ style: { marginBottom: 6 } },
		...renglones
			.filter((renglon): renglon is string => renglon !== null && renglon !== "")
			.map((renglon) => h(Text, { style: estilos.renglon }, renglon)),
	);
}

/**
 * Un título de sección, en negritas.
 * @param texto Lo que dice.
 */
export function subtituloPdf(texto: string): ReactElement {
	return h(Text, { style: estilos.subtitulo }, texto);
}

/** Una columna de una tabla. */
export interface ColumnaDeHoja {
	titulo: string;
	/** Cuánto del ancho toma, en proporción a las demás. */
	ancho: number;
	/** Las cifras van a la derecha. */
	derecha?: boolean;
}

/**
 * Una celda de una tabla.
 * @param columna Su columna.
 * @param texto Lo que dice.
 * @param negritas Si va en negritas.
 */
function celda(columna: ColumnaDeHoja, texto: string, negritas = false): ReactElement {
	return h(
		Text,
		{
			style: [
				estilos.celda,
				{ flexGrow: columna.ancho, flexBasis: 0, textAlign: columna.derecha === true ? "right" : "left" },
				...(negritas ? [estilos.negritas] : []),
			],
		},
		texto,
	);
}

/**
 * Una tabla que se parte en varias hojas y repite su encabezado en cada una.
 * @param columnas Sus columnas.
 * @param renglones Lo de cada renglón, una celda por columna.
 * @param total El renglón del total, si lleva, en negritas.
 */
export function tablaPdf(
	columnas: readonly ColumnaDeHoja[],
	renglones: readonly (readonly string[])[],
	total?: readonly string[],
): ReactElement {
	const titulos = h(
		View,
		{ style: estilos.filaTitulos, fixed: true },
		...columnas.map((columna) => celda(columna, columna.titulo, true)),
	);
	const filas = renglones.map((renglon) =>
		h(View, { style: estilos.fila, wrap: false }, ...columnas.map((columna, i) => celda(columna, renglon[i] ?? ""))),
	);
	const suma =
		total === undefined
			? []
			: [
					h(
						View,
						{ style: estilos.filaTotal, wrap: false },
						...columnas.map((columna, i) => celda(columna, total[i] ?? "", true)),
					),
				];
	return h(View, { style: estilos.tabla }, titulos, ...filas, ...suma);
}

/**
 * Renglones para firmar: «Recibí completo» con nombre, firma y fecha.
 * @param titulo Lo que dice arriba.
 * @param campos Cada renglón: «Nombre», «Firma», «Fecha».
 */
export function firmasPdf(titulo: string, campos: readonly string[]): ReactElement {
	return h(
		View,
		{ style: estilos.firmas, wrap: false },
		h(Text, { style: estilos.negritas }, titulo),
		...campos.map((campo) =>
			h(View, { style: estilos.lineaDeFirma }, h(Text, null, campo), h(View, { style: estilos.raya })),
		),
	);
}
