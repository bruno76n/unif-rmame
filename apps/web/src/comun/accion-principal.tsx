/**
 * La acción principal de un departamento, arriba a la derecha en la barra superior. La pantalla del departamento la
 * pone con `<AccionPrincipal>…</AccionPrincipal>` y el armazón la muestra en su lugar; la que no tiene, no la pone.
 * Fase 19 · docs/interfaz/comunes.md («La barra superior») y el archivo de cada departamento («Acción principal»)
 */

import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** El id del lugar de la acción principal en la barra superior. */
export const lugarDeLaAccion = "accion-principal";

/**
 * El lugar de la acción principal, para el armazón.
 */
export function LugarDeLaAccion() {
	return <div id={lugarDeLaAccion} className="contents" />;
}

/**
 * Pone la acción principal del departamento en la barra superior.
 * @param props La acción (un botón del sistema).
 */
export function AccionPrincipal({ children }: { children: ReactNode }) {
	const [lugar, setLugar] = useState<HTMLElement | null>(null);
	useEffect(() => setLugar(document.getElementById(lugarDeLaAccion)), []);
	return lugar === null ? null : createPortal(children, lugar);
}
