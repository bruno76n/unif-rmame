/**
 * El enlace: un botón con forma de enlace, en el color de la marca y en negritas, subrayado al pasar el puntero. Abre
 * algo sin salir de la pantalla (un cajón, el pedido de una nota, «Ver todas») o hace una acción chica dentro de un
 * texto («Llenar todo», «Quitar»).
 * Fase 19 · docs/interfaz/DISENO.md («Los componentes»)
 *
 * Uso: `<Enlace onClick={() => ir({ cajon: "pedido", id })}>{folio}</Enlace>`. Sin `type`, es `button`: nunca manda un
 * formulario por accidente.
 */

import type { ButtonHTMLAttributes } from "react";
import { unirClases } from "../clases.ts";

/** Lo que recibe un enlace: lo de un botón de HTML, menos su clase. */
export interface PropsDeEnlace extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style"> {
	/** En negritas fuertes, para un folio. */
	fuerte?: boolean;
}

/**
 * Un botón con forma de enlace.
 * @param props Si va en negritas fuertes y lo de un botón de HTML.
 */
export function Enlace({ fuerte = false, type = "button", children, ...resto }: PropsDeEnlace) {
	return (
		<button
			type={type}
			className={unirClases(
				"self-start text-left text-marca underline-offset-2 hover:enabled:underline",
				"disabled:cursor-not-allowed disabled:opacity-40",
				fuerte ? "font-bold" : "font-semibold",
			)}
			{...resto}
		>
			{children}
		</button>
	);
}
