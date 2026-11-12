/**
 * El selector: escoger una opción de una lista corta, con su etiqueta y su error, del mismo alto que un campo.
 * Fase 19 · docs/interfaz/DISENO.md («Selector»)
 *
 * Uso: `<Selector etiqueta="Ubicación" opciones={[{ valor: id, texto: "Bodega" }]} {...register("ubicacion_id")} />`.
 * Es el `select` del navegador con el estilo del sistema: en el teléfono abre la lista nativa.
 */

import { ChevronDown } from "lucide-react";
import { type Ref, type SelectHTMLAttributes, useId } from "react";
import { unirClases } from "../clases.ts";

/** Una opción del selector. */
export interface Opcion {
	valor: string;
	texto: string;
}

/** Lo que recibe un selector. */
export interface PropsDeSelector extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "className" | "style"> {
	etiqueta: string;
	opciones: readonly Opcion[];
	/** El texto de la opción vacía, si se puede no escoger nada («Todas»). */
	vacio?: string;
	error?: string | undefined;
	enVentana?: boolean;
	ref?: Ref<HTMLSelectElement>;
}

/**
 * Un selector con su etiqueta y su error.
 * @param props La etiqueta, las opciones, la opción vacía, el error y lo de un select de HTML.
 */
export function Selector({ etiqueta, opciones, vacio, error, enVentana = false, id, ...resto }: PropsDeSelector) {
	const propio = useId();
	const selectorId = id ?? propio;
	const errorId = `${selectorId}-error`;
	return (
		<div className="flex flex-col gap-1.5">
			<label htmlFor={selectorId} className="font-semibold text-etiqueta text-tinta2">
				{etiqueta}
			</label>
			<div className="relative">
				<select
					id={selectorId}
					aria-invalid={error === undefined ? undefined : true}
					aria-describedby={error === undefined ? undefined : errorId}
					className={unirClases(
						"w-full appearance-none rounded-mediano border bg-panel pr-10 pl-3.5 text-tinta",
						"focus:border-marca focus:outline-none focus:ring-3 focus:ring-marca/20 disabled:bg-suave",
						enVentana ? "h-campo-ventana" : "h-campo",
						error === undefined ? "border-linea2" : "border-texto-error",
					)}
					{...resto}
				>
					{vacio === undefined ? null : <option value="">{vacio}</option>}
					{opciones.map((opcion) => (
						<option key={opcion.valor} value={opcion.valor}>
							{opcion.texto}
						</option>
					))}
				</select>
				<ChevronDown
					aria-hidden="true"
					size={18}
					strokeWidth={1.9}
					className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 text-tinta3"
				/>
			</div>
			{error === undefined ? null : (
				<span id={errorId} role="alert" className="text-etiqueta text-texto-error">
					{error}
				</span>
			)}
		</div>
	);
}
