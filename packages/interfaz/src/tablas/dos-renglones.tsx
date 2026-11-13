/**
 * Una celda de dos renglones: el dato y, abajo, su detalle en chico («L-2026-118» y «Colegio Morelos · 40 piezas»);
 * el dato va en rojo si urge.
 * Fase 19 · docs/interfaz/DISENO.md (la letra y las tablas)
 */

import type { ReactNode } from "react";
import { unirClases } from "../clases.ts";

/** Lo que recibe la celda. */
export interface PropsDeDosRenglones {
	arriba: ReactNode;
	abajo?: ReactNode;
	/** El dato en rojo. */
	rojo?: boolean;
}

/**
 * Una celda de dos renglones.
 * @param props El dato, su detalle y si el dato va en rojo.
 */
export function DosRenglones({ arriba, abajo, rojo = false }: PropsDeDosRenglones) {
	return (
		<span className="flex min-w-0 flex-col">
			{/* El de arriba es el folio o el nombre: en negritas, como pide el diseño, y sin partirse. */}
			<span className={unirClases("whitespace-nowrap font-semibold tabular-nums", rojo && "text-texto-error")}>
				{arriba}
			</span>
			{abajo === undefined ? null : <span className="text-etiqueta text-tinta2">{abajo}</span>}
		</span>
	);
}
