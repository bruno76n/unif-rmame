/**
 * Un dato con su etiqueta arriba: «Cliente», «Entrega», «Piezas»… en las cabeceras de cajones y tarjetas.
 * Fase 19 · docs/interfaz/DISENO.md (la letra) y docs/interfaz/comunes.md («El cajón»)
 */

import type { ReactNode } from "react";

/**
 * Un dato con su etiqueta.
 * @param props La etiqueta y el valor.
 */
export function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
	return (
		<div className="flex min-w-0 flex-col gap-0.5">
			<span className="font-semibold text-etiqueta text-tinta3">{etiqueta}</span>
			<span className="font-semibold tabular-nums">{children}</span>
		</div>
	);
}
