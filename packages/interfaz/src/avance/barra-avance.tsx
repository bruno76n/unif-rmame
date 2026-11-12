/**
 * La barra de avance por etapa, en los colores de cada etapa: lo entregado, lo listo en aduana, lo que está en
 * producción… o el reparto por estado de una cifra de Pendientes.
 * Fase 19 · docs/interfaz/DISENO.md («BarraAvance») y docs/interfaz/TEXTOS.md («Las etapas de pedidos, notas y lotes»)
 *
 * Uso: `<BarraAvance segmentos={[{ etiqueta: "Entregado", valor: 70, color: "verde" }, …]} />`.
 */

import { unirClases } from "../clases.ts";
import type { ColorDeEstado } from "../estados/colores.ts";

/** El fondo de cada color de estado en la barra. */
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

/** Un tramo de la barra. */
export interface Segmento {
	etiqueta: string;
	valor: number;
	color: ColorDeEstado;
}

/**
 * La barra de avance.
 * @param props Los tramos, en su orden.
 */
export function BarraAvance({ segmentos }: { segmentos: readonly Segmento[] }) {
	const total = segmentos.reduce((suma, segmento) => suma + segmento.valor, 0);
	return (
		<span
			role="img"
			aria-label={segmentos.map((segmento) => `${segmento.etiqueta}: ${segmento.valor}`).join(", ")}
			className="flex h-1.5 w-full overflow-hidden rounded-full bg-riel"
		>
			{total === 0
				? null
				: segmentos
						.filter((segmento) => segmento.valor > 0)
						.map((segmento) => (
							<span
								key={segmento.etiqueta}
								className={unirClases("h-full", fondo[segmento.color])}
								style={{ width: `${(segmento.valor / total) * 100}%` }}
							/>
						))}
		</span>
	);
}
