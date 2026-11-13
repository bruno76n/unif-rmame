/**
 * Lo que comparten las pestañas y los cajones de Mantenimiento: una lista con su día.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Fallas», «Servicios», «Cajones»)
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import type { ReactNode } from "react";

/**
 * Una lista de renglones con su día a la derecha («Historial», «Lo que está deteniendo»).
 * @param props Los renglones, con su clave, su texto y su día; y lo que dice si no hay.
 */
export function ListaConDia({
	renglones,
	vacio,
}: {
	renglones: readonly { clave: string; texto: ReactNode; dia: string }[];
	vacio?: string;
}) {
	if (renglones.length === 0) return vacio === undefined ? null : <p className="m-0 text-tinta3">{vacio}</p>;
	return (
		<ul className="m-0 flex list-none flex-col divide-y divide-linea p-0">
			{renglones.map((renglon) => (
				<li key={renglon.clave} className="flex justify-between gap-4 py-2">
					<span>{renglon.texto}</span>
					<span className="flex-none text-etiqueta text-tinta3">{textoDeDiaCorto(renglon.dia)}</span>
				</li>
			))}
		</ul>
	);
}
