/**
 * La gráfica de Indicadores: barras o líneas por periodo, con sus series en los colores de cada tipo y su leyenda.
 * Fase 19 · docs/interfaz/DISENO.md («Grafica») y docs/interfaz/fabrica/direccion.md («Indicadores»)
 *
 * Uso: `<Grafica tipo="barras" periodos={["S41", "S42"]} series={[{ clave: "t1", nombre: "Tienda 1", color: "azul",
 * valores: [12, 15] }]} />`. Los valores llegan ya calculados por la consulta.
 */

import {
	Bar,
	BarChart,
	CartesianGrid,
	Legend,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import type { ColorDeTipo } from "../pagina/colores-de-tipo.ts";

/** Una serie de la gráfica. */
export interface Serie {
	clave: string;
	nombre: string;
	color: ColorDeTipo;
	valores: readonly number[];
}

/** Lo que recibe una gráfica. */
export interface PropsDeGrafica {
	tipo: "barras" | "lineas";
	periodos: readonly string[];
	series: readonly Serie[];
	/** Cómo se escribe un valor (en pesos, en piezas). */
	formato?: (valor: number) => string;
	alto?: number;
}

/**
 * Una gráfica de Indicadores.
 * @param props El tipo, los periodos, las series, el formato y el alto.
 */
export function Grafica({ tipo, periodos, series, formato = (valor) => String(valor), alto = 240 }: PropsDeGrafica) {
	const datos = periodos.map((periodo, i) => ({
		periodo,
		...Object.fromEntries(series.map((serie) => [serie.clave, serie.valores[i] ?? 0])),
	}));
	const color = (serie: Serie) => `var(--color-${serie.color})`;
	const ejes = (
		<>
			<CartesianGrid stroke="var(--color-linea)" vertical={false} />
			<XAxis dataKey="periodo" tickLine={false} axisLine={false} fontSize={12} />
			<YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={formato} width={64} />
			<Tooltip formatter={(valor) => formato(Number(valor))} />
			<Legend iconType="circle" />
		</>
	);
	return (
		<div role="img" aria-label={series.map((serie) => serie.nombre).join(", ")} style={{ height: alto }}>
			<ResponsiveContainer width="100%" height="100%">
				{tipo === "barras" ? (
					<BarChart data={datos}>
						{ejes}
						{series.map((serie) => (
							<Bar
								key={serie.clave}
								dataKey={serie.clave}
								name={serie.nombre}
								fill={color(serie)}
								radius={[4, 4, 0, 0]}
								isAnimationActive={false}
							/>
						))}
					</BarChart>
				) : (
					<LineChart data={datos}>
						{ejes}
						{series.map((serie) => (
							<Line
								key={serie.clave}
								dataKey={serie.clave}
								name={serie.nombre}
								stroke={color(serie)}
								strokeWidth={2}
								dot={false}
								isAnimationActive={false}
							/>
						))}
					</LineChart>
				)}
			</ResponsiveContainer>
		</div>
	);
}
