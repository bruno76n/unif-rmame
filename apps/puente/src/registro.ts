/**
 * Su registro: un archivo de texto con lo que hace el puente (arranques, cada trabajo con su resultado y cada error),
 * sin el contenido de las etiquetas, con lo de los últimos 30 días.
 * Fase 20 · docs/apps/puente-de-impresion.md («Su registro»)
 */

import { appendFile, readFile, writeFile } from "node:fs/promises";

/** Los días que guarda el registro. */
const diasQueGuarda = 30;

/** El registro del puente. */
export interface Registro {
	/** Anota un renglón con su hora. */
	anotar: (texto: string) => Promise<void>;
	/** Quita los renglones de hace más de 30 días; se llama al arrancar. */
	recortar: () => Promise<void>;
}

/**
 * Abre el registro.
 * @param archivo Su archivo.
 * @param ahora La hora; las pruebas la fijan.
 */
export function crearRegistro(archivo: string, ahora: () => Date = () => new Date()): Registro {
	return {
		anotar: (texto) => appendFile(archivo, `${ahora().toISOString()} ${texto.replace(/\s+/g, " ")}\n`),
		recortar: async () => {
			const texto = await readFile(archivo, "utf8").catch(() => "");
			const desde = ahora().getTime() - diasQueGuarda * 24 * 60 * 60 * 1000;
			// Cada renglón empieza con su hora ISO: se quedan los de los últimos 30 días.
			const quedan = texto.split("\n").filter((renglon) => renglon !== "" && Date.parse(renglon.slice(0, 24)) >= desde);
			await writeFile(archivo, quedan.map((renglon) => `${renglon}\n`).join(""));
		},
	};
}
