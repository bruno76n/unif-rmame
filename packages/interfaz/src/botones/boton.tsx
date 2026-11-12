/**
 * El botón: principal (negro), secundario (blanco con borde), fantasma (solo texto) y de peligro (texto rojo); de 44 px
 * de alto, o 34 el chico, redondeado de 10 px, con su ícono de 17 px a la izquierda si lo lleva.
 * Fase 19 · docs/interfaz/DISENO.md («Los componentes», «Medidas»)
 *
 * Uso: `<Boton variante="principal" icono={Plus} onClick={...}>Nuevo producto</Boton>`. El texto es un verbo en
 * infinitivo (ver docs/interfaz/TEXTOS.md). Sin `type`, es `button`: nunca manda un formulario por accidente.
 */

import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { unirClases } from "../clases.ts";

/** Las variantes del botón. */
export type VarianteDeBoton = "principal" | "secundario" | "fantasma" | "peligro";

/** Las clases de cada variante. */
const variantes: Readonly<Record<VarianteDeBoton, string>> = {
	principal: "border-transparent bg-tinta text-white hover:enabled:bg-tinta2",
	secundario: "border-linea2 bg-panel text-tinta hover:enabled:bg-suave",
	fantasma: "border-transparent bg-transparent text-tinta2 hover:enabled:bg-riel hover:enabled:text-tinta",
	peligro: "border-linea2 bg-panel text-estado-rojo hover:enabled:bg-suave",
};

/** Lo que recibe un botón: lo de un botón de HTML, menos su clase. */
export interface PropsDeBoton extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style"> {
	variante?: VarianteDeBoton;
	/** El de 34 px, para las tablas y los pies de cajón apretados. */
	chico?: boolean;
	/** Un ícono de lucide-react, a la izquierda del texto. */
	icono?: LucideIcon;
}

/**
 * Un botón del sistema.
 * @param props La variante, si es chico, su ícono y lo de un botón de HTML.
 */
export function Boton({
	variante = "secundario",
	chico = false,
	icono: Icono,
	type = "button",
	children,
	...resto
}: PropsDeBoton) {
	return (
		<button
			type={type}
			className={unirClases(
				"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-mediano border font-bold transition-colors",
				"disabled:cursor-not-allowed disabled:opacity-40",
				chico ? "h-boton-chico px-3.5 text-sm" : "h-boton px-5",
				variantes[variante],
			)}
			{...resto}
		>
			{Icono === undefined ? null : <Icono aria-hidden="true" size={17} strokeWidth={1.9} />}
			{children}
		</button>
	);
}
