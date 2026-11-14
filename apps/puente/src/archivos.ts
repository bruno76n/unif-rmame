/**
 * Escribir un archivo de un jalón y hasta el disco: un temporal que se escribe, se baja al disco (`datasync`) y
 * reemplaza al anterior. Así un apagón deja el archivo viejo o el nuevo, nunca uno vacío o a medias.
 * Fase 20 · docs/apps/puente-de-impresion.md (regla 5, «El diario» y «La configuración»)
 */

import { open, rename } from "node:fs/promises";

/**
 * Reemplaza un archivo con un texto, de un jalón y hasta el disco.
 * @param archivo El archivo.
 * @param texto Lo que lleva.
 * @param modo Sus permisos, si es nuevo.
 */
export async function escribirDeUnJalon(archivo: string, texto: string, modo = 0o600): Promise<void> {
	const temporal = `${archivo}.nuevo`;
	const descriptor = await open(temporal, "w", modo);
	try {
		await descriptor.writeFile(texto);
		await descriptor.datasync();
	} finally {
		await descriptor.close();
	}
	await rename(temporal, archivo);
}
