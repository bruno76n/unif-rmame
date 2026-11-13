/**
 * Un grupo plegable de una pestaña («Sin tiempo de entrega · 3», «Atorados · 2»): su punto de color, el botón que lo
 * abre o lo pliega, su casilla si se escoge todo el grupo, su nombre y cuántos trae; abierto, su contenido.
 * Fase 19 · docs/interfaz/comunes.md («La página de un departamento») y docs/interfaz/DISENO.md («Los colores»)
 *
 * Uso: `<GrupoPlegable titulo="Pedir esta semana" color="ambar" cuantos="4 materiales" abierto={…} alCambiar={…}>…</GrupoPlegable>`.
 */

import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Casilla } from "../captura/casilla.tsx";
import { unirClases } from "../clases.ts";

/** El color del punto de un grupo. */
export type ColorDeGrupo = "rojo" | "ambar" | "azul" | "verde" | "violeta" | "pizarra";

/** La clase del punto de cada color. */
const puntoDeGrupo: Readonly<Record<ColorDeGrupo, string>> = {
	rojo: "bg-estado-rojo",
	ambar: "bg-estado-ambar",
	azul: "bg-estado-azul",
	verde: "bg-estado-verde",
	violeta: "bg-estado-morado",
	pizarra: "bg-estado-gris",
};

/** Lo que recibe un grupo plegable. */
export interface PropsDeGrupoPlegable {
	titulo: string;
	color: ColorDeGrupo;
	/** Cuántos trae, ya escrito («3 materiales»). */
	cuantos: string;
	abierto: boolean;
	alCambiar: (abierto: boolean) => void;
	/** La casilla de todo el grupo, si se escoge. */
	casilla?: { marcada: boolean; alCambiar: (marcada: boolean) => void } | undefined;
	children: ReactNode;
}

/**
 * Un grupo plegable.
 * @param props Su nombre, su color, cuántos trae, si está abierto, su casilla y su contenido.
 */
export function GrupoPlegable({ titulo, color, cuantos, abierto, alCambiar, casilla, children }: PropsDeGrupoPlegable) {
	const Flecha = abierto ? ChevronDown : ChevronRight;
	return (
		<section className="flex flex-col gap-3">
			<header className="flex items-center gap-3">
				<span aria-hidden="true" className={unirClases("size-2 rounded-full", puntoDeGrupo[color])} />
				<button
					type="button"
					aria-expanded={abierto}
					aria-label={abierto ? `Plegar ${titulo}` : `Abrir ${titulo}`}
					onClick={() => alCambiar(!abierto)}
					className="grid size-8 place-items-center rounded-mediano border border-linea2 bg-panel text-tinta2 hover:bg-suave"
				>
					<Flecha aria-hidden="true" size={17} strokeWidth={1.9} />
				</button>
				{casilla === undefined ? null : (
					<Casilla etiqueta={`Escoger ${titulo}`} sinTexto marcada={casilla.marcada} alCambiar={casilla.alCambiar} />
				)}
				<h2 className="m-0 font-bold text-subtitulo">{titulo}</h2>
				<span className="text-tinta3">{cuantos}</span>
			</header>
			{abierto ? children : null}
		</section>
	);
}
