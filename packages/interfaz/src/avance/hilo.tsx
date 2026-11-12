/**
 * El hilo del pedido: las seis paradas de una prenda (Pedido · Corte · Costura · Calidad · Aduana · Entrega), cada una
 * con sus piezas y su línea corta abajo, en minúsculas, ámbar o roja si urge. Una parada que trae su nombre (en
 * reabasto y temporada: «Orden» y la tienda o «Bodega») lo muestra en lugar del de siempre.
 * Fase 19 · docs/interfaz/comunes.md («El hilo del pedido») y docs/interfaz/TEXTOS.md («El hilo»)
 *
 * Uso: `<Hilo paradas={prenda.paradas} />`, con lo que regresa `produccion.hilo_pedido`.
 */

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

/**
 * El hilo de una prenda.
 * @param props Sus paradas, en orden.
 */
export function Hilo({ paradas }: { paradas: readonly Parada[] }) {
	return (
		<ol className="m-0 grid list-none grid-cols-6 gap-0 p-0 max-telefono:grid-cols-3 max-telefono:gap-y-3">
			{paradas.map((parada) => (
				<li key={parada.parada} className="flex flex-col gap-0.5 border-linea2 border-t-2 pt-2 pr-2">
					<span className="font-semibold text-etiqueta text-tinta3">
						{parada.nombre ?? nombres[parada.parada] ?? parada.parada}
					</span>
					<b className="font-bold text-subtitulo tabular-nums">{parada.piezas}</b>
					<span
						className={unirClases(
							"text-etiqueta",
							parada.tono === "rojo"
								? "font-bold text-estado-rojo"
								: parada.tono === "ambar"
									? "font-bold text-texto-advertencia"
									: "text-tinta2",
						)}
					>
						{parada.linea}
					</span>
				</li>
			))}
		</ol>
	);
}
