/**
 * El estado: un cuadro de color sólido con texto blanco en negritas, sin punto, y su línea de abajo si la lleva.
 * Fase 19 · docs/interfaz/DISENO.md (regla 5, «Cuadro de estado») y docs/interfaz/TEXTOS.md («Los estados»)
 *
 * Uso: `<Estado texto="Por surtir · sale hoy" />`. El color sale de la guía (`colorDelEstado`); una etapa que toma el
 * color de su urgencia lo pasa en `color`.
 */

import { unirClases } from "../clases.ts";
import { type ColorDeEstado, colorDelEstado } from "./colores.ts";

/** La clase de fondo de cada color de estado. */
const fondo: Readonly<Record<ColorDeEstado, string>> = {
	rojo: "bg-estado-rojo",
	ambar: "bg-estado-ambar",
	azul: "bg-estado-azul",
	verde: "bg-estado-verde",
	gris: "bg-estado-gris",
	morado: "bg-estado-morado",
	"verde-azulado": "bg-estado-verde-azulado",
	naranja: "bg-estado-naranja",
};

/** Lo que recibe un estado. */
export interface PropsDeEstado {
	/** El texto, en una de las siete formas de la guía. */
	texto: string;
	/** El color, si no es el de la guía (una etapa con el color de su urgencia). */
	color?: ColorDeEstado;
	/** La alerta que va abajo, en el mismo cuadro («Atrasado 3 días»). */
	abajo?: string;
}

/**
 * Pinta un estado.
 * @param props El texto, su color y la línea de abajo.
 */
export function Estado({ texto, color, abajo }: PropsDeEstado) {
	return (
		<span
			className={unirClases(
				"inline-flex min-w-estado flex-col items-center justify-center whitespace-nowrap rounded-chico px-3 text-center font-bold text-etiqueta text-white leading-tight",
				abajo === undefined ? "h-estado-alto" : "min-h-estado-alto py-1",
				fondo[color ?? colorDelEstado(texto)],
			)}
			data-color={color ?? colorDelEstado(texto)}
		>
			<span>{texto}</span>
			{abajo === undefined ? null : <span className="font-semibold text-xs opacity-95">{abajo}</span>}
		</span>
	);
}
