/**
 * La barra de indicadores de Pendientes: varias cifras, cada una con su ícono y su nombre, el número con su unidad, una
 * línea de contexto (lo rojo y lo ámbar primero, separado por «·»), una gráfica chica si hay al menos 3 datos, y la
 * barra repartida por estado si sus colores son estados. Toda la cifra lleva a su pestaña; no lleva botones. En el
 * teléfono pone dos cifras por renglón.
 * Fase 19 · docs/interfaz/comunes.md («La página de un departamento», regla 3) y docs/interfaz/DISENO.md
 */

import type { LucideIcon } from "lucide-react";
import { BarraAvance } from "../avance/barra-avance.tsx";
import { unirClases } from "../clases.ts";
import type { ColorDeEstado } from "../estados/colores.ts";
import { GraficaChica } from "../graficas/grafica-chica.tsx";
import { type ColorDeTipo, iconoDeTipo } from "./colores-de-tipo.ts";

/** Una parte de la línea de contexto. */
export interface Contexto {
	texto: string;
	tono?: "rojo" | "ambar" | "normal";
}

/** Una cifra de la barra. */
export interface Cifra {
	clave: string;
	nombre: string;
	icono: LucideIcon;
	color: ColorDeTipo;
	numero: number | string;
	unidad?: string;
	contexto?: readonly Contexto[];
	/** Los datos de la gráfica chica (sale con 3 o más). */
	serie?: readonly number[];
	/** El reparto por estado. */
	reparto?: readonly { color: ColorDeEstado; valor: number; etiqueta: string }[];
	/** Lleva a su pestaña. */
	alTocar: () => void;
}

/** El color del número según su contexto más urgente. */
const tonoDelNumero = (contexto: readonly Contexto[] | undefined) =>
	contexto?.some((parte) => parte.tono === "rojo")
		? "text-estado-rojo"
		: contexto?.some((parte) => parte.tono === "ambar")
			? "text-texto-advertencia"
			: "text-tinta";

/**
 * La barra de indicadores.
 * @param props Las cifras.
 */
export function BarraIndicadores({ cifras }: { cifras: readonly Cifra[] }) {
	return (
		<div
			className="grid overflow-hidden rounded-grande bg-panel shadow-panel max-telefono:grid-cols-2"
			style={{ gridTemplateColumns: `repeat(${cifras.length}, minmax(0, 1fr))` }}
		>
			{cifras.map(({ clave, nombre, icono: Icono, color, numero, unidad, contexto, serie, reparto, alTocar }) => {
				const ordenado = [...(contexto ?? [])].sort(
					(una, otra) =>
						["rojo", "ambar", "normal"].indexOf(una.tono ?? "normal") -
						["rojo", "ambar", "normal"].indexOf(otra.tono ?? "normal"),
				);
				return (
					<button
						key={clave}
						type="button"
						onClick={alTocar}
						className="flex min-w-0 flex-col gap-1.5 border-linea border-r px-4 py-4 text-left last:border-r-0 hover:bg-suave"
					>
						<span className="flex items-center gap-2 font-semibold text-tinta">
							<span className={unirClases("grid size-6 place-items-center rounded-chico", iconoDeTipo[color])}>
								<Icono aria-hidden="true" size={13} strokeWidth={1.9} />
							</span>
							{nombre}
							{serie !== undefined && serie.length >= 3 ? (
								<span className="ml-auto">
									<GraficaChica valores={serie} />
								</span>
							) : null}
						</span>
						<span className="flex items-baseline gap-2">
							<b className={unirClases("font-bold text-titulo-seccion tabular-nums", tonoDelNumero(contexto))}>
								{numero}
							</b>
							{unidad === undefined ? null : <span className="text-tinta2">{unidad}</span>}
						</span>
						{ordenado.length === 0 ? null : (
							<span className="text-etiqueta text-tinta2">
								{ordenado.map((parte, i) => (
									<span key={parte.texto}>
										{i === 0 ? null : " · "}
										<span
											className={unirClases(
												parte.tono === "rojo" && "font-bold text-estado-rojo",
												parte.tono === "ambar" && "font-bold text-texto-advertencia",
											)}
										>
											{parte.texto}
										</span>
									</span>
								))}
							</span>
						)}
						{reparto === undefined ? null : <BarraAvance segmentos={reparto} />}
					</button>
				);
			})}
		</div>
	);
}
