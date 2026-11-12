/**
 * Un ZIP con varios archivos, comprimidos con deflate: el del paquete del contador (su relación y sus comprobantes).
 * Fase 18 · docs/modulos/contaduria/contador-y-cuadres.md («Armar el archivo del paquete»)
 *
 * El stack no trae una librería de ZIP y la plataforma sí trae lo difícil (`deflateRawSync` y `crc32` de Node): aquí
 * solo va el formato (PKWARE APPNOTE 6.3: encabezado local, directorio central y su cierre), con los nombres en UTF-8.
 */

import { crc32, deflateRawSync } from "node:zlib";

/** Un archivo que va en el ZIP. */
export interface ArchivoDelZip {
	/** Su nombre dentro del ZIP, con carpetas si las lleva («comprobantes/G-0012.pdf»). */
	nombre: string;
	contenido: Uint8Array;
}

/** La fecha y la hora en el formato de MS-DOS que pide el ZIP. */
function fechaDos(momento: Date): { hora: number; fecha: number } {
	return {
		hora: (momento.getHours() << 11) | (momento.getMinutes() << 5) | Math.floor(momento.getSeconds() / 2),
		fecha: ((momento.getFullYear() - 1980) << 9) | ((momento.getMonth() + 1) << 5) | momento.getDate(),
	};
}

/**
 * Arma el ZIP.
 * @param archivos Los archivos, en el orden en que van.
 * @param momento La fecha que llevan (la de ahora).
 * @returns El ZIP completo.
 */
export function armarZip(archivos: readonly ArchivoDelZip[], momento = new Date()): Uint8Array {
	const { hora, fecha } = fechaDos(momento);
	const locales: Buffer[] = [];
	const centrales: Buffer[] = [];
	let desplazamiento = 0;
	for (const archivo of archivos) {
		const nombre = Buffer.from(archivo.nombre, "utf8");
		const comprimido = deflateRawSync(archivo.contenido);
		const suma = crc32(archivo.contenido);
		// Lo común del encabezado local y del central: versión 2.0, nombres en UTF-8 (bit 11), deflate.
		const comun = Buffer.alloc(26);
		comun.writeUInt16LE(20, 0);
		comun.writeUInt16LE(0x0800, 2);
		comun.writeUInt16LE(8, 4);
		comun.writeUInt16LE(hora, 6);
		comun.writeUInt16LE(fecha, 8);
		comun.writeUInt32LE(suma, 10);
		comun.writeUInt32LE(comprimido.length, 14);
		comun.writeUInt32LE(archivo.contenido.length, 18);
		comun.writeUInt16LE(nombre.length, 22);
		comun.writeUInt16LE(0, 24);
		const local = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), comun, nombre, comprimido]);
		// Comentario, disco, atributos internos y externos en cero, y dónde empieza su encabezado local.
		const resto = Buffer.alloc(14);
		resto.writeUInt32LE(desplazamiento, 10);
		centrales.push(Buffer.concat([Buffer.from([0x50, 0x4b, 0x01, 0x02]), Buffer.from([20, 0]), comun, resto, nombre]));
		locales.push(local);
		desplazamiento += local.length;
	}
	const directorio = Buffer.concat(centrales);
	const cierre = Buffer.alloc(22);
	cierre.writeUInt32LE(0x06054b50, 0);
	cierre.writeUInt16LE(archivos.length, 8);
	cierre.writeUInt16LE(archivos.length, 10);
	cierre.writeUInt32LE(directorio.length, 12);
	cierre.writeUInt32LE(desplazamiento, 16);
	return new Uint8Array(Buffer.concat([...locales, directorio, cierre]));
}
