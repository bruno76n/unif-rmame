/**
 * Lo que comparten las pestañas y los cajones de Mantenimiento: una lista con su día y los errores de una regla en sus
 * campos.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Fallas», «Servicios», «Cajones»)
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import type { ReactNode } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";

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

/**
 * Pone junto a su campo los errores que regresó una acción (`400` con `campos`): solo los de campos que tiene el
 * formulario; los demás ya los dice el aviso de abajo.
 * @param campos Los errores por campo que regresó la acción.
 * @param formulario El formulario de React Hook Form.
 */
export function erroresEnSusCampos<Valores extends FieldValues>(
	campos: Readonly<Record<string, string>>,
	formulario: Pick<UseFormReturn<Valores>, "getValues" | "setError">,
): void {
	const valores = formulario.getValues();
	const esCampo = (campo: string): campo is Path<Valores> => campo in valores;
	for (const [campo, mensaje] of Object.entries(campos)) {
		if (esCampo(campo)) formulario.setError(campo, { message: mensaje });
	}
}
