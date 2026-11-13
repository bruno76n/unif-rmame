/**
 * El campo de un archivo (la foto del producto, el comprobante, la factura, la evidencia): su etiqueta arriba, la caja
 * con «Escoger archivo» y el nombre del escogido, y su mensaje de error abajo. La caja es del mismo alto que un campo.
 * Fase 19 · docs/interfaz/DISENO.md («Campo», regla 8) y docs/modulos/admin/archivos.md (regla 1)
 *
 * El archivo se sube cuando se manda la acción que lo usa (`subirArchivo` de la web): el campo solo lo escoge.
 */

import { useId } from "react";
import { unirClases } from "../clases.ts";

/** Lo que recibe el campo de un archivo. */
export interface PropsDeCampoDeArchivo {
	etiqueta: string;
	/** Los tipos que acepta, como el `accept` de HTML («image/*», «application/pdf,.xml»). */
	acepta: string;
	/** El archivo escogido, o nada. */
	archivo: File | null;
	alEscoger: (archivo: File | null) => void;
	error?: string | undefined;
	/** El de 44 px, dentro de una ventana. */
	enVentana?: boolean;
	disabled?: boolean;
}

/**
 * Un campo para escoger un archivo, con su etiqueta y su error.
 * @param props La etiqueta, los tipos que acepta, el archivo escogido, qué hacer al escoger y el error.
 */
export function CampoDeArchivo({
	etiqueta,
	acepta,
	archivo,
	alEscoger,
	error,
	enVentana = false,
	disabled = false,
}: PropsDeCampoDeArchivo) {
	const campoId = useId();
	const errorId = `${campoId}-error`;
	return (
		<div className="flex flex-col gap-1.5">
			<span className="font-semibold text-etiqueta text-tinta2">{etiqueta}</span>
			<label
				htmlFor={campoId}
				className={unirClases(
					"flex w-full cursor-pointer items-center gap-3 rounded-mediano border bg-panel px-3.5",
					"focus-within:border-marca focus-within:ring-3 focus-within:ring-marca/20",
					disabled ? "cursor-not-allowed bg-suave text-tinta3" : "",
					enVentana ? "h-campo-ventana" : "h-campo",
					error === undefined ? "border-linea2" : "border-texto-error",
				)}
			>
				<span className="flex-none font-semibold text-marca">Escoger archivo</span>
				<span className={unirClases("min-w-0 truncate", archivo === null ? "text-tinta3" : "text-tinta")}>
					{archivo === null ? "Ningún archivo" : archivo.name}
				</span>
				<input
					id={campoId}
					type="file"
					accept={acepta}
					disabled={disabled}
					aria-label={etiqueta}
					aria-invalid={error === undefined ? undefined : true}
					aria-describedby={error === undefined ? undefined : errorId}
					className="sr-only"
					onChange={(evento) => alEscoger(evento.target.files?.[0] ?? null)}
				/>
			</label>
			{error === undefined ? null : (
				<span id={errorId} role="alert" className="text-etiqueta text-texto-error">
					{error}
				</span>
			)}
		</div>
	);
}
