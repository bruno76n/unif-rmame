/**
 * El lector de etiquetas: `BarcodeDetector` del navegador leyendo Code 128 (el formato de las etiquetas) o, si no lo
 * trae, el polyfill `barcode-detector` con su wasm servido por la misma tablet, para que lea sin internet. Y buscar un
 * bulto por su folio en la copia, sin importar mayúsculas: no necesita red.
 * Fase 20 · docs/apps/tablet.md («El lector de etiquetas») y docs/interfaz/tablet.md («Escanear bulto»)
 */

import "barcode-detector/polyfill";
import { prepareZXingModule } from "barcode-detector/polyfill";
import zxingWasm from "zxing-wasm/reader/zxing_reader.wasm?url";
import type { BaseDeLaTablet, Renglon } from "../copia/base.ts";

/** Cómo es el folio de un bulto: «B-2026-121-03». */
const folioDeBulto = /^B-\d{4}-\d+-\d+$/;

/**
 * El lector de Code 128: `BarcodeDetector` del navegador o, si no lo trae, el del polyfill (que se instala solo en ese
 * caso), con su wasm servido por la tablet y no por internet.
 */
export function crearLector(): BarcodeDetector {
	prepareZXingModule({
		overrides: { locateFile: (archivo: string) => (archivo.endsWith(".wasm") ? zxingWasm : archivo) },
	});
	return new BarcodeDetector({ formats: ["code_128"] });
}

/** Lo que pasó al buscar un código. */
export type BusquedaDeBulto =
	| { encontrado: true; bulto: Renglon }
	| { encontrado: false; motivo: "no_es_bulto" | "no_esta" };

/**
 * Busca un bulto por lo que se leyó o se escribió, sin importar mayúsculas.
 * @param base La base local.
 * @param codigo Lo leído.
 */
export async function buscarBulto(base: BaseDeLaTablet, codigo: string): Promise<BusquedaDeBulto> {
	const folio = codigo.trim().toUpperCase();
	if (!folioDeBulto.test(folio)) return { encontrado: false, motivo: "no_es_bulto" };
	const bulto = await base.copia("bultos").where("folio_mayusculas").equals(folio).first();
	return bulto === undefined ? { encontrado: false, motivo: "no_esta" } : { encontrado: true, bulto };
}
