/**
 * El botón con cifra: arriba del cuerpo del cajón, lleva a lo relacionado en otro departamento («3 lotes en
 * producción»). Si la cuenta no tiene ese departamento, muestra la cifra sin llevar a ningún lado.
 * Fase 19 · docs/interfaz/comunes.md («El cajón», regla 2)
 *
 * Uso: `<BotonConCifra cifra={3} texto="lotes en producción" icono={Factory} alTocar={() => navegar(...)} />`. Sin
 * `alTocar`, es solo la cifra.
 */

import type { LucideIcon } from "lucide-react";
import { unirClases } from "../clases.ts";

/** Lo que recibe un botón con cifra. */
export interface PropsDeBotonConCifra {
	cifra: number;
	/** Lo que cuenta, en plural o singular según la cifra («lotes en producción», «solicitud que la pide»). */
	texto: string;
	icono?: LucideIcon;
	/** Lleva a lo relacionado; sin él, la cuenta no tiene ese departamento. */
	alTocar?: () => void;
}

/**
 * Un botón con cifra.
 * @param props La cifra, lo que cuenta, su ícono y a dónde lleva.
 */
export function BotonConCifra({ cifra, texto, icono: Icono, alTocar }: PropsDeBotonConCifra) {
	const contenido = (
		<>
			{Icono === undefined ? null : <Icono aria-hidden="true" size={17} strokeWidth={1.9} className="text-tinta3" />}
			<b className="font-bold tabular-nums">{cifra}</b>
			<span>{texto}</span>
		</>
	);
	const clases =
		"inline-flex h-boton-chico items-center gap-2 rounded-mediano border border-linea2 bg-panel px-3.5 text-sm";
	return alTocar === undefined ? (
		<span className={unirClases(clases, "text-tinta2")}>{contenido}</span>
	) : (
		<button type="button" onClick={alTocar} className={unirClases(clases, "font-semibold text-tinta hover:bg-suave")}>
			{contenido}
		</button>
	);
}
