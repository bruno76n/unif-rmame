/**
 * El campo de captura: su etiqueta arriba, la caja de 48 px (44 dentro de una ventana) y su mensaje de error abajo,
 * con el foco de la marca.
 * Fase 19 · docs/interfaz/DISENO.md («Campo», regla 8)
 *
 * Uso con React Hook Form: `<Campo etiqueta="Motivo" error={errores.motivo?.message} {...register("motivo")} />`. El
 * error es el de la API o el del esquema del contrato, tal cual.
 */

import { type InputHTMLAttributes, type Ref, useId } from "react";
import { unirClases } from "../clases.ts";

/** Lo que recibe un campo: lo de un input de HTML, menos su clase, y su etiqueta. */
export interface PropsDeCampo extends Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "style"> {
	etiqueta: string;
	error?: string | undefined;
	/** El de 44 px, dentro de una ventana. */
	enVentana?: boolean;
	ref?: Ref<HTMLInputElement>;
}

/**
 * Un campo con su etiqueta y su error.
 * @param props La etiqueta, el error y lo de un input de HTML.
 */
export function Campo({ etiqueta, error, enVentana = false, id, ...resto }: PropsDeCampo) {
	const propio = useId();
	const campoId = id ?? propio;
	const errorId = `${campoId}-error`;
	return (
		<div className="flex flex-col gap-1.5">
			<label htmlFor={campoId} className="font-semibold text-etiqueta text-tinta2">
				{etiqueta}
			</label>
			<input
				id={campoId}
				aria-invalid={error === undefined ? undefined : true}
				aria-describedby={error === undefined ? undefined : errorId}
				className={unirClases(
					"w-full rounded-mediano border bg-panel px-3.5 text-tinta placeholder:text-tinta3",
					"focus:border-marca focus:outline-none focus:ring-3 focus:ring-marca/20",
					"disabled:bg-suave disabled:text-tinta3",
					enVentana ? "h-campo-ventana" : "h-campo",
					error === undefined ? "border-linea2" : "border-texto-error",
				)}
				{...resto}
			/>
			{error === undefined ? null : (
				<span id={errorId} role="alert" className="text-etiqueta text-texto-error">
					{error}
				</span>
			)}
		</div>
	);
}
