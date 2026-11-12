/**
 * Los pasos de un documento, con el actual marcado: lo hecho en negro, el actual con el anillo de la marca, lo que
 * falta en gris.
 * Fase 19 · docs/interfaz/DISENO.md («Pasos»)
 *
 * Uso: `<Pasos pasos={["Borrador", "Confirmado", "En producción", "Entregado"]} actual={1} />`.
 */

import { Check } from "lucide-react";
import { unirClases } from "../clases.ts";

/**
 * Los pasos de un documento.
 * @param props Los pasos y el índice del actual.
 */
export function Pasos({ pasos, actual }: { pasos: readonly string[]; actual: number }) {
	return (
		<ol className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
			{pasos.map((paso, i) => (
				<li
					key={paso}
					aria-current={i === actual ? "step" : undefined}
					className={unirClases(
						"inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold text-sm",
						i < actual && "bg-tinta text-white",
						i === actual && "bg-marca-fondo text-marca-texto ring-2 ring-marca",
						i > actual && "bg-riel text-tinta3",
					)}
				>
					{i < actual ? <Check aria-hidden="true" size={14} strokeWidth={2.5} /> : null}
					{paso}
				</li>
			))}
		</ol>
	);
}
