/**
 * Cómo suben sus archivos las ventanas que los mandan con su acción (en Contaduría, el comprobante de un gasto, el XML
 * y el PDF de una factura, la nota de crédito y el documento del contador; en Administración, la evidencia de una
 * restauración): al mandar, no al escoger, con `subirArchivo`; la acción manda después el `archivo_id`.
 * Fase 19 · docs/interfaz/comunes.md («Subir un archivo») y docs/modulos/admin/archivos.md (reglas 1 y 4)
 *
 * El mismo archivo escogido se sube una sola vez: si la acción no sale y se vuelve a mandar, va con el mismo
 * `archivo_id`, y así la clave de la intención, que se reusa tras una falla sin respuesta, lleva lo mismo.
 */

import { useRef, useState } from "react";
import { leerFalla, subirArchivo } from "./api.tsx";
import { useAvisar } from "./avisos-de-abajo.tsx";

/**
 * Lo que el selector de archivos ofrece en cada campo de Contaduría (el `accept` de HTML). Solo ayuda a escoger: los tipos que se
 * aceptan los revisa la API por su propósito (`admin.subir_archivo`), y su mensaje sale en el aviso.
 */
export const aceptaDe = {
	comprobante: "image/jpeg,image/png,image/webp,image/heic,application/pdf,.xml,application/xml,text/xml",
	xml: ".xml,application/xml,text/xml",
	pdfOFoto: "application/pdf,image/jpeg,image/png,image/webp,image/heic",
	notaCredito: "application/pdf,image/jpeg,image/png,image/webp,image/heic,.xml,application/xml,text/xml",
	documentoContador:
		"application/pdf,image/jpeg,image/png,image/webp,image/heic,.xml,application/xml,text/xml,.zip,application/zip,application/x-zip-compressed",
} as const;

/**
 * Sube los archivos de una ventana al mandarla.
 * @param proposito El propósito de sus archivos (`comprobante`, `factura_proveedor`, `evidencia_restauracion`…).
 * @param modulo El módulo que los sube (`contaduria`, `admin`).
 * @returns `subir(archivo)`, que regresa el `archivo_id` (o nada si no se subió, ya avisado), y si está subiendo.
 */
export function useSubidaAlMandar(proposito: string, modulo: string) {
	const avisar = useAvisar();
	const [subiendo, setSubiendo] = useState(false);
	// Lo ya subido de esta ventana, por archivo escogido.
	const subidos = useRef(new Map<File, string>());
	/**
	 * Sube un archivo, o da el id del que ya se subió. Si no se puede, el aviso dice por qué.
	 * @param archivo El archivo escogido.
	 */
	const subir = async (archivo: File): Promise<string | undefined> => {
		const yaSubido = subidos.current.get(archivo);
		if (yaSubido !== undefined) return yaSubido;
		setSubiendo(true);
		try {
			const archivoId = await subirArchivo(proposito, modulo, archivo);
			subidos.current.set(archivo, archivoId);
			return archivoId;
		} catch (error) {
			const falla = leerFalla(error);
			avisar(falla.tipo === "regla" ? falla.mensaje : "El archivo no se subió. Intenta otra vez.", "no_se_pudo");
			return undefined;
		} finally {
			setSubiendo(false);
		}
	};
	return { subir, subiendo };
}
