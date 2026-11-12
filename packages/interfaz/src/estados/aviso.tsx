/**
 * El aviso de abajo: al centro, por 3 segundos, oscuro con texto blanco y un ícono redondo que dice cómo salió: verde
 * con palomita cuando algo se hizo, ámbar con «!» cuando no se pudo.
 * Fase 19 · docs/interfaz/DISENO.md («Aviso de abajo») y docs/interfaz/comunes.md («El aviso de abajo»)
 *
 * Uso: `<Aviso texto="PE-0150 confirmado para Colegio Morelos" como="bien" alCerrar={...} />`. El texto es el que
 * regresa la acción, tal cual. Quien lo muestra decide cuándo; el aviso se cierra solo a los 3 segundos.
 */

import { Check } from "lucide-react";
import { useEffect } from "react";
import { unirClases } from "../clases.ts";

/** Cuánto dura el aviso a la vista. */
export const duracionDelAviso = 3000;

/** Lo que recibe el aviso. */
export interface PropsDeAviso {
	texto: string;
	/** Si se hizo (verde) o no se pudo (ámbar). */
	como: "bien" | "no_se_pudo";
	/** Se llama a los 3 segundos. */
	alCerrar: () => void;
}

/**
 * El aviso de abajo.
 * @param props El texto, cómo salió y qué hacer al cerrarse.
 */
export function Aviso({ texto, como, alCerrar }: PropsDeAviso) {
	useEffect(() => {
		const reloj = setTimeout(alCerrar, duracionDelAviso);
		return () => clearTimeout(reloj);
	}, [alCerrar]);
	return (
		<div
			role="status"
			aria-live="polite"
			className="-translate-x-1/2 fixed bottom-6.5 left-1/2 z-50 flex max-w-160 items-center gap-3 rounded-mediano bg-tinta px-4 py-3 font-semibold text-aviso text-white shadow-flotante"
		>
			<span
				aria-hidden="true"
				className={unirClases(
					"grid size-5.5 flex-none place-items-center rounded-full font-bold text-sm text-tinta",
					como === "bien" ? "bg-aviso-bien" : "bg-estado-ambar",
				)}
			>
				{como === "bien" ? <Check size={14} strokeWidth={3} /> : "!"}
			</span>
			<span>{texto}</span>
		</div>
	);
}
