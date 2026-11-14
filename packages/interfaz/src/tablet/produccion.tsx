/**
 * La producción de una persona en la tablet: la cifra grande de «Hoy llevas» y sus barras por hora, con sus piezas
 * arriba; la última barra es la de la hora actual, en verde.
 * Fase 20 · docs/interfaz/tablet.md («Inicio de cada persona»)
 *
 * Uso: `<CifraGrande cifra={96} unidad="piezas" />`, `<BarrasPorHora barras={[{ hora: "8", piezas: 24 }]} />`.
 */

import { unirClases } from "../clases.ts";

/**
 * La cifra grande, con su unidad.
 * @param props La cifra y su unidad.
 */
export function CifraGrande({ cifra, unidad }: { cifra: number; unidad: string }) {
	return (
		<div className="mt-1 font-extrabold text-tablet-cifra leading-none tracking-tight tabular-nums">
			{cifra}
			<span className="ml-2.5 font-semibold text-[22px] text-tinta3 tracking-normal">{unidad}</span>
		</div>
	);
}

/**
 * Las barras por hora: la altura de cada una, proporcional a sus piezas.
 * @param props Cada barra: su hora y sus piezas.
 */
export function BarrasPorHora({ barras }: { barras: readonly { hora: string; piezas: number }[] }) {
	const mayor = Math.max(1, ...barras.map((barra) => barra.piezas));
	return (
		<div className="mt-5.5 flex min-h-35 flex-1 items-end gap-2.5" role="img" aria-label="Piezas por hora">
			{barras.map((barra, i) => (
				<div key={barra.hora} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
					<span className="font-bold text-[13px] text-tinta2 tabular-nums">{barra.piezas}</span>
					<i
						className={unirClases(
							"block min-h-1 w-full rounded-t-[6px] rounded-b-[2px]",
							i === barras.length - 1 ? "bg-estado-verde" : "bg-estado-azul",
						)}
						style={{ height: `${(barra.piezas / mayor) * 100}%` }}
					/>
					<small className="font-semibold text-[13px] text-tinta3">{barra.hora}</small>
				</div>
			))}
		</div>
	);
}
