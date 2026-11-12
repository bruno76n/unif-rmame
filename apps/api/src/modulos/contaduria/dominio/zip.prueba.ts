/**
 * Prueba del ZIP del paquete del contador: lo que entra se lee igual desde su directorio central, con su CRC y sus
 * nombres en UTF-8.
 * Fase 18 · docs/modulos/contaduria/contador-y-cuadres.md («Armar el archivo del paquete»)
 */

import { crc32, inflateRawSync } from "node:zlib";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { armarZip } from "./zip.ts";

/**
 * Lee un ZIP desde su directorio central, como lo lee cualquier programa: cada archivo con su nombre y su contenido.
 * @param zip El ZIP.
 */
function leerZip(zip: Uint8Array): { nombre: string; contenido: Uint8Array }[] {
	const datos = Buffer.from(zip);
	const cierre = datos.length - 22;
	expect(datos.readUInt32LE(cierre)).toBe(0x06054b50);
	const cuantos = datos.readUInt16LE(cierre + 10);
	let central = datos.readUInt32LE(cierre + 16);
	const leidos: { nombre: string; contenido: Uint8Array }[] = [];
	for (let i = 0; i < cuantos; i++) {
		expect(datos.readUInt32LE(central)).toBe(0x02014b50);
		const suma = datos.readUInt32LE(central + 16);
		const comprimido = datos.readUInt32LE(central + 20);
		const largoNombre = datos.readUInt16LE(central + 28);
		const local = datos.readUInt32LE(central + 42);
		const nombre = datos.subarray(central + 46, central + 46 + largoNombre).toString("utf8");
		expect(datos.readUInt32LE(local)).toBe(0x04034b50);
		const inicio = local + 30 + datos.readUInt16LE(local + 26);
		const contenido = new Uint8Array(inflateRawSync(datos.subarray(inicio, inicio + comprimido)));
		expect(crc32(contenido)).toBe(suma);
		leidos.push({ nombre, contenido });
		central += 46 + largoNombre;
	}
	return leidos;
}

describe("el ZIP del paquete se lee igual que se armó", () => {
	it("la relación y los comprobantes, con nombres con acentos y carpetas", () => {
		const relacion = new TextEncoder().encode("concepto,monto\r\nnómina,964.20\r\n");
		const archivos = [
			{ nombre: "relacion.csv", contenido: relacion },
			{ nombre: "gastos/G-0012 recibo de luz.pdf", contenido: new Uint8Array(3000).fill(37) },
		];
		expect(leerZip(armarZip(archivos))).toEqual(archivos);
	});

	it("con archivos al azar, vacíos o grandes, se lee lo mismo que entró", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						nombre: fc.string({ minLength: 1, maxLength: 40 }),
						contenido: fc.uint8Array({ maxLength: 4000 }),
					}),
					{ maxLength: 8 },
				),
				(archivos) => {
					expect(leerZip(armarZip(archivos))).toEqual(archivos);
				},
			),
			{ numRuns: 200 },
		);
	});
});
