/**
 * El hilo del pedido: las seis paradas de una prenda (Pedido · Corte · Costura · Calidad · Aduana · Entrega) en una vía,
 * cada una con sus piezas y su línea corta abajo, en minúsculas, ámbar o roja si urge. Una parada que trae su nombre (en
 * reabasto y temporada: «Orden» y la tienda o «Bodega») lo muestra en lugar del de siempre.
 * Fase 19 · docs/interfaz/comunes.md («El hilo del pedido») y docs/interfaz/TEXTOS.md («El hilo»)
 *
 * Uso: `<Hilo paradas={prenda.paradas} />`, con lo que regresa `produccion.hilo_pedido`.
 */

import { Check } from "lucide-react";
import { unirClases } from "../clases.ts";

/** El nombre de cada parada. */
const nombres: Readonly<Record<string, string>> = {
	pedido: "Pedido",
	corte: "Corte",
	costura: "Costura",
	calidad: "Calidad",
	aduana: "Aduana",
	entrega: "Entrega",
};

/** Una parada del hilo. */
export interface Parada {
	parada: string;
	/** Su nombre, si no es el de siempre. */
	nombre?: string | undefined;
	piezas: number;
	linea: string;
	tono: "normal" | "ambar" | "rojo";
}

/** El color de cada parada, como en la muestra: así se reconoce de un vistazo dónde va el pedido. */
const colores: Readonly<Record<string, string>> = {
	pedido: "bg-tinta2 border-tinta2",
	corte: "bg-estado-azul border-estado-azul",
	costura: "bg-estado-ambar border-estado-ambar",
	calidad: "bg-estado-verde-azulado border-estado-verde-azulado",
	aduana: "bg-estado-morado border-estado-morado",
	entrega: "bg-estado-verde border-estado-verde",
};

/**
 * El hilo de una prenda: una vía con un nodo por parada. La parada con piezas lleva su color y cuántas son; la que ya
 * pasaron todas, una palomita verde; la que falta, el nodo vacío. La vía se pinta de verde hasta la parada más avanzada.
 * @param props Sus paradas, en orden.
 */
export function Hilo({ paradas }: { paradas: readonly Parada[] }) {
	const total = paradas.reduce((suma, parada) => suma + parada.piezas, 0);
	return (
		<ol aria-label="Dónde van las piezas" className="m-0 grid list-none grid-cols-6 p-0">
			{paradas.map((parada, i) => {
				const antes = paradas.slice(0, i).reduce((suma, una) => suma + una.piezas, 0);
				const despues = paradas.slice(i + 1).reduce((suma, una) => suma + una.piezas, 0);
				const estado = parada.piezas > 0 ? "con_piezas" : total > 0 && antes === 0 ? "pasada" : "falta";
				const nombre = parada.nombre ?? nombres[parada.parada] ?? parada.parada;
				return (
					<li
						key={parada.parada}
						className="relative flex min-w-0 flex-col items-center px-0.5 text-center"
						title={parada.piezas > 0 ? `${nombre}: ${parada.piezas} piezas` : nombre}
					>
						{i < paradas.length - 1 ? (
							<span
								aria-hidden="true"
								className={unirClases(
									"absolute top-3 left-1/2 h-1 w-full rounded-full",
									despues > 0 ? "bg-estado-verde" : "bg-linea2",
								)}
							/>
						) : null}
						<span
							className={unirClases(
								"relative z-10 grid h-7.5 min-w-7.5 place-items-center border-2 text-white",
								estado === "con_piezas"
									? unirClases("rounded-mediano px-1.5", colores[parada.parada] ?? "bg-tinta2 border-tinta2")
									: estado === "pasada"
										? "rounded-full border-estado-verde bg-estado-verde"
										: "rounded-mediano border-linea2 bg-panel",
							)}
						>
							{estado === "con_piezas" ? (
								<b className="font-extrabold text-etiqueta tabular-nums">{parada.piezas}</b>
							) : estado === "pasada" ? (
								<Check aria-label="Ya pasaron" size={15} strokeWidth={3} />
							) : null}
						</span>
						<span
							className={unirClases(
								"mt-1.5 whitespace-nowrap text-etiqueta",
								estado === "falta" ? "font-semibold text-tinta3" : "font-bold text-tinta",
							)}
						>
							{nombre}
						</span>
						<span
							className={unirClases(
								"max-w-full truncate text-xs",
								parada.tono === "rojo"
									? "font-bold text-estado-rojo"
									: parada.tono === "ambar"
										? "font-bold text-texto-advertencia"
										: estado === "con_piezas"
											? "font-semibold text-tinta2"
											: "text-tinta3",
							)}
						>
							{parada.linea === "" ? "\u00a0" : parada.linea}
						</span>
					</li>
				);
			})}
		</ol>
	);
}
