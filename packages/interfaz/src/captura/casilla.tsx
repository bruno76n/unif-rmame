/**
 * La casilla: marcar o desmarcar algo de una lista (un rollo, un renglón de la tabla), con su etiqueta a la derecha.
 * Fase 19 · docs/interfaz/DISENO.md («Casilla»)
 *
 * Uso: `<Casilla etiqueta="R-0432 · 88.5 m" marcada={...} alCambiar={...} />`. Es el Checkbox de Base UI. Sin
 * etiqueta visible (en una tabla), `etiqueta` va al lector de pantalla.
 */

import { Checkbox } from "@base-ui/react/checkbox";
import { Check } from "lucide-react";

/** Lo que recibe una casilla. */
export interface PropsDeCasilla {
	etiqueta: string;
	marcada: boolean;
	alCambiar: (marcada: boolean) => void;
	/** Sin texto a la vista: la etiqueta solo la oye el lector de pantalla. */
	sinTexto?: boolean;
	deshabilitada?: boolean;
}

/**
 * Una casilla con su etiqueta.
 * @param props La etiqueta, si está marcada, qué hacer al cambiar, si se ve su texto y si está apagada.
 */
export function Casilla({ etiqueta, marcada, alCambiar, sinTexto = false, deshabilitada = false }: PropsDeCasilla) {
	return (
		// biome-ignore lint/a11y/noLabelWithoutControl: el Root de Base UI lleva su control dentro de la etiqueta
		<label className="inline-flex cursor-pointer items-center gap-2.5 text-tinta2 has-[[data-disabled]]:cursor-not-allowed has-[[data-disabled]]:opacity-40">
			<Checkbox.Root
				checked={marcada}
				onCheckedChange={(valor) => alCambiar(valor)}
				disabled={deshabilitada}
				aria-label={sinTexto ? etiqueta : undefined}
				className="grid size-5 flex-none place-items-center rounded-chico border border-linea2 bg-panel text-white data-[checked]:border-tinta data-[checked]:bg-tinta"
			>
				<Checkbox.Indicator>
					<Check aria-hidden="true" size={14} strokeWidth={3} />
				</Checkbox.Indicator>
			</Checkbox.Root>
			{sinTexto ? null : <span>{etiqueta}</span>}
		</label>
	);
}
