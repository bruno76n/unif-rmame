/**
 * Lo que comparten la subida, el ligado, el guardado y la vista de los archivos.
 * Fase 4 · docs/modulos/admin/archivos.md («Reglas»)
 */

import type { Temporal } from "temporal-polyfill";
import type { QuienEscribe } from "../../../nucleo/modulos.ts";
import type { propositosDeArchivo } from "../tablas.ts";

/** Un propósito de archivo. */
export type Proposito = (typeof propositosDeArchivo)[number];

/** Las imágenes que se aceptan. */
const imagenes = ["image/jpeg", "image/png", "image/webp", "image/heic"];
/** Un PDF. */
const pdf = ["application/pdf"];
/** Un XML (el de una factura). */
const xml = ["application/xml", "text/xml"];

/** Los tipos que acepta cada propósito, con cómo se dicen en el mensaje. */
export const tiposPorProposito: Readonly<Record<Proposito, { tipos: readonly string[]; texto: string }>> = {
	foto: { tipos: imagenes, texto: "JPG, PNG, WEBP o HEIC" },
	comprobante: { tipos: [...imagenes, ...pdf, ...xml], texto: "una imagen, un PDF o un XML" },
	factura_proveedor: { tipos: [...pdf, ...imagenes, ...xml], texto: "un PDF, una imagen o un XML" },
	documento_contador: {
		// Windows dice `application/x-zip-compressed` de un ZIP.
		tipos: [...pdf, ...imagenes, ...xml, "application/zip", "application/x-zip-compressed"],
		texto: "un PDF, una imagen, un XML o un ZIP",
	},
	guia: { tipos: pdf, texto: "un PDF" },
	pdf_documento: { tipos: pdf, texto: "un PDF" },
	etiqueta: { tipos: pdf, texto: "un PDF" },
	evidencia_restauracion: { tipos: [...imagenes, ...pdf, "text/plain"], texto: "una imagen, un PDF o un texto" },
};

/**
 * La llave del objeto en R2: `{modulo}/{año}/{mes}/{archivo_id}`, con el año y el mes del día de negocio.
 * @param modulo El módulo del documento.
 * @param dia El día de negocio.
 * @param archivoId El id del archivo.
 */
export function claveEnElAlmacen(modulo: string, dia: Temporal.PlainDate, archivoId: string): string {
	return `${modulo}/${dia.year}/${String(dia.month).padStart(2, "0")}/${archivoId}`;
}

/**
 * Quién subió un archivo, en sus columnas: la cuenta en `creado_por`; el aparato y la persona aparte.
 * @param quien Quién llama.
 */
export function columnasDeQuienSube(quien: QuienEscribe) {
	return {
		creadoPor: quien.tipo === "cuenta" ? quien.usuarioId : null,
		dispositivoId: quien.tipo === "aparato" ? quien.dispositivoId : null,
		personaId: quien.tipo === "aparato" ? (quien.personaId ?? null) : null,
	};
}

/**
 * Dice si quien llama es quien subió el archivo: la misma cuenta, o el mismo aparato.
 * @param quien Quién llama.
 * @param archivo Quién lo subió.
 */
export function loSubio(
	quien: QuienEscribe,
	archivo: { creadoPor: string | null; dispositivoId: string | null },
): boolean {
	if (quien.tipo === "cuenta") return archivo.creadoPor === quien.usuarioId;
	if (quien.tipo === "aparato") return archivo.dispositivoId === quien.dispositivoId;
	return false;
}

/** Cuántos bytes tiene un megabyte. */
export const bytesPorMb = 1024 * 1024;
