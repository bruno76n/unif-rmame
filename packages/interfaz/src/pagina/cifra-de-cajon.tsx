/**
 * Una cifra de un cajón: el número grande y, abajo, qué es («3 fallas», «12 piezas por contar»), en un recuadro suave.
 * Fase 19 · docs/interfaz/DISENO.md (la letra) y docs/interfaz/comunes.md («El cajón»)
 */

import { unirClases } from "../clases.ts";

/**
 * Una cifra de un cajón.
 * @param props El número ya escrito, qué es y si va en rojo.
 */
export function CifraDeCajon({ numero, nombre, rojo = false }: { numero: string; nombre: string; rojo?: boolean }) {
	return (
		<div className="flex flex-col gap-0.5 rounded-mediano bg-suave px-4 py-3">
			<b className={unirClases("font-bold text-subtitulo tabular-nums", rojo && "text-estado-rojo")}>{numero}</b>
			<span className="text-etiqueta text-tinta3">{nombre}</span>
		</div>
	);
}
