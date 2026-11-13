/**
 * Un grupo de prendas de Recetas y Rendimiento: el grupo plegable del sistema de diseño con su punto de color,
 * «{n} prendas» y su tabla en un panel. Sin prendas, no sale.
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («Recetas» y «Rendimiento»: los grupos)
 */

import { type ColorDeGrupo, GrupoPlegable } from "@uniformame/interfaz/contenedores/grupo-plegable";
import type { ColorDeEstado } from "@uniformame/interfaz/estados/colores";
import { type ReactNode, useState } from "react";

/** El punto de cada color de estado en un grupo. */
const colorDelGrupo: Readonly<Record<ColorDeEstado, ColorDeGrupo>> = {
	rojo: "rojo",
	ambar: "ambar",
	azul: "azul",
	verde: "verde",
	gris: "pizarra",
	morado: "violeta",
	"verde-azulado": "verde",
	naranja: "ambar",
};

/**
 * Un grupo de prendas.
 * @param props Su nombre, su color, cuántas prendas lleva, si empieza plegado y su contenido.
 */
export function GrupoDePrendas({
	titulo,
	color,
	prendas,
	plegadoAlEmpezar = false,
	children,
}: {
	titulo: string;
	color: ColorDeEstado;
	prendas: number;
	plegadoAlEmpezar?: boolean;
	children: ReactNode;
}) {
	const [abierto, setAbierto] = useState(!plegadoAlEmpezar);
	if (prendas === 0) return null;
	return (
		<GrupoPlegable
			titulo={titulo}
			color={colorDelGrupo[color]}
			cuantos={`${prendas} ${prendas === 1 ? "prenda" : "prendas"}`}
			abierto={abierto}
			alCambiar={setAbierto}
		>
			<div className="rounded-grande bg-panel p-4 shadow-panel">{children}</div>
		</GrupoPlegable>
	);
}
