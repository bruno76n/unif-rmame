/**
 * Para las pruebas de las etiquetas y las hojas: lee lo que trae un PDF (la medida y el texto de cada página) y lee
 * otra vez las barras de un Code 128 con un lector de códigos.
 * Fase 20 · docs/impresos/etiquetas.md («Cómo se prueba») y docs/impresos/hojas.md
 *
 * El PDF lo arma React-PDF con las letras que trae todo PDF: cada texto va en la página como cadenas hexadecimales en
 * WinAnsi, dentro de su flujo comprimido con Flate. Aquí se abre cada objeto, se descomprime el flujo de cada página y
 * se juntan sus cadenas. El lector de barras es el de `barcode-detector` (zxing), el mismo del lector de la tablet, con
 * su wasm de `node_modules` y no de internet.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { inflateSync } from "node:zlib";
import { BarcodeDetector, prepareZXingModule } from "barcode-detector/ponyfill";

/** Una página leída de un PDF. */
export interface PaginaLeida {
	/** Su ancho y su alto, en puntos de PDF. */
	ancho: number;
	alto: number;
	/** Cada texto de la página, en el orden en que se escribió. */
	textos: string[];
}

/** WinAnsi de los caracteres de 0x80 a 0x9F que no son los de latin1 (comillas, guiones, «…»). */
const winAnsi: ReadonlyMap<number, string> = new Map([
	[0x80, "€"],
	[0x85, "…"],
	[0x91, "‘"],
	[0x92, "’"],
	[0x93, "“"],
	[0x94, "”"],
	[0x96, "–"],
	[0x97, "—"],
]);

/**
 * Una cadena hexadecimal de un flujo, como texto.
 * @param hexadecimal Lo de adentro de `<…>`.
 */
function deHexadecimal(hexadecimal: string): string {
	const bytes = hexadecimal.match(/../g) ?? [];
	return bytes
		.map((par) => {
			const codigo = Number.parseInt(par, 16);
			return winAnsi.get(codigo) ?? String.fromCharCode(codigo);
		})
		.join("");
}

/**
 * Los textos de un flujo de página: cada `TJ` o `Tj`, con sus pedazos juntos.
 * @param flujo El flujo ya descomprimido.
 */
function textosDelFlujo(flujo: string): string[] {
	const textos: string[] = [];
	for (const [, arreglo, sola] of flujo.matchAll(/\[(.*?)\]\s*TJ|<([0-9a-fA-F]*)>\s*Tj/g)) {
		const pedazos =
			arreglo === undefined ? [sola ?? ""] : [...arreglo.matchAll(/<([0-9a-fA-F]*)>/g)].map((uno) => uno[1] ?? "");
		textos.push(pedazos.map(deHexadecimal).join(""));
	}
	return textos.filter((texto) => texto.length > 0);
}

/**
 * Lee la medida y el texto de cada página de un PDF.
 * @param pdf Los bytes del PDF.
 */
export function leerPdf(pdf: Uint8Array): PaginaLeida[] {
	const crudo = Buffer.from(pdf);
	const texto = crudo.toString("latin1");
	const objetos = new Map<number, { cuerpo: string; flujo: Buffer | null }>();
	for (const coincidencia of texto.matchAll(/(\d+) 0 obj([\s\S]*?)endobj/g)) {
		const [, numero, cuerpo = ""] = coincidencia;
		const inicioDelFlujo = cuerpo.indexOf("stream");
		let flujo: Buffer | null = null;
		if (inicioDelFlujo >= 0) {
			const desde = (coincidencia.index ?? 0) + coincidencia[0].indexOf("stream") + "stream".length;
			const salto = texto[desde] === "\r" ? 2 : 1;
			const hasta = texto.indexOf("endstream", desde);
			const bytes = crudo.subarray(desde + salto, hasta).subarray(0);
			flujo = cuerpo.includes("/FlateDecode") ? inflateSync(bytes) : bytes;
		}
		objetos.set(Number(numero), { cuerpo, flujo });
	}
	const paginas: PaginaLeida[] = [];
	for (const { cuerpo } of objetos.values()) {
		if (!/\/Type\s*\/Page\b/.test(cuerpo)) continue;
		const caja = /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(cuerpo);
		const contenido = /\/Contents\s+(\d+) 0 R/.exec(cuerpo);
		const flujo = contenido === null ? null : (objetos.get(Number(contenido[1]))?.flujo ?? null);
		paginas.push({
			ancho: Number(caja?.[3] ?? 0) - Number(caja?.[1] ?? 0),
			alto: Number(caja?.[4] ?? 0) - Number(caja?.[2] ?? 0),
			textos: flujo === null ? [] : textosDelFlujo(flujo.toString("latin1")),
		});
	}
	return paginas;
}

/** Si el lector ya tiene su wasm. */
let lectorListo = false;

/**
 * Lee las barras de una imagen PNG con un lector de Code 128.
 * @param png La imagen.
 * @returns Lo que dicen las barras que encontró.
 */
export async function leerBarras(png: Uint8Array): Promise<string[]> {
	if (!lectorListo) {
		// El wasm de zxing, como lo trae barcode-detector: el suyo, no uno bajado de internet.
		const requerir = createRequire(createRequire(import.meta.url).resolve("barcode-detector/ponyfill"));
		const wasm = requerir.resolve("zxing-wasm/reader/zxing_reader.wasm");
		prepareZXingModule({ overrides: { wasmBinary: readFileSync(wasm).buffer } });
		// El lector arma sus resultados con DOMRectReadOnly, que Node no trae.
		if (!("DOMRectReadOnly" in globalThis)) {
			Object.assign(globalThis, {
				DOMRectReadOnly: class {
					x: number;
					y: number;
					width: number;
					height: number;
					constructor(x = 0, y = 0, width = 0, height = 0) {
						this.x = x;
						this.y = y;
						this.width = width;
						this.height = height;
					}
				},
			});
		}
		lectorListo = true;
	}
	const lector = new BarcodeDetector({ formats: ["code_128"] });
	const encontrados = await lector.detect(new Blob([new Uint8Array(png)], { type: "image/png" }));
	return encontrados.map((encontrado) => encontrado.rawValue);
}
