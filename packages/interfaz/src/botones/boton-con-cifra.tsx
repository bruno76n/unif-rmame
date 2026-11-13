/**
 * El botón con cifra: arriba del cuerpo del cajón, lleva a lo relacionado en otro departamento («3 lotes en
 * producción»). Sin cifra, es solo lo relacionado («PE-0145 · pedido · entrega parcial», «$5,000 anticipo recibido»). Si
 * la cuenta no tiene ese departamento, se muestra sin llevar a ningún lado.
 * Fase 19 · docs/interfaz/comunes.md («El cajón», regla 2)
 *
 * Uso: `<BotonConCifra cifra={3} texto="lotes en producción" icono={Factory} alTocar={() => navegar(...)} />`. Sin
 * `alTocar`, es solo la cifra.
 */

import type { LucideIcon } from "lucide-react";
import { unirClases } from "../clases.ts";

/** Lo que recibe un botón con cifra. */
export interface PropsDeBotonConCifra {
	/** La cifra; sin ella, el texto es todo lo relacionado. */
	cifra?: number | undefined;
	/** Lo que cuenta, en plural o singular según la cifra («lotes en producción», «solicitud que la pide»). */
	texto: string;
	icono?: LucideIcon | undefined;
	/** Lleva a lo relacionado; sin él, la cuenta no tiene ese departamento. */
	alTocar?: (() => void) | undefined;
}

/**
 * Un botón con cifra.
 * @param props La cifra, lo que cuenta, su ícono y a dónde lleva.
 */
export function BotonConCifra({ cifra, texto, icono: Icono, alTocar }: PropsDeBotonConCifra) {
	const contenido = (
		<>
			{Icono === undefined ? null : <Icono aria-hidden="true" size={17} strokeWidth={1.9} className="text-tinta3" />}
			{cifra === undefined ? null : <b className="font-bold tabular-nums">{cifra}</b>}
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
