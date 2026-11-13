/**
 * La gráfica chica de una cifra de Pendientes: unas barras sin ejes, la última en negro, o en el color de su cifra si
 * va en rojo o en ámbar («Horas de paro por mes»).
 * Fase 19 · docs/interfaz/DISENO.md («GraficaChica») y docs/interfaz/comunes.md (regla 3)
 *
 * Uso: `<GraficaChica valores={[3, 5, 2, 8]} />`. Sale con 3 datos o más; quien la usa decide si cabe.
 */

import { Bar, BarChart, Cell } from "recharts";

/** El color de la última barra, por el tono de su cifra. */
const colorDeLaUltima = {
	normal: "var(--color-tinta)",
	rojo: "var(--color-estado-rojo)",
	ambar: "var(--color-texto-advertencia)",
} as const;
/** El color de las barras anteriores: el riel. */
const colorDeLasAnteriores = "var(--color-linea2)";

/**
 * Una gráfica chica.
 * @param props Los valores, del más viejo al más nuevo, y el tono de su cifra (en tinta si no tiene).
 */
export function GraficaChica({ valores, tono }: { valores: readonly number[]; tono?: "rojo" | "ambar" | undefined }) {
	const datos = valores.map((valor, i) => ({ i, valor }));
	return (
		<span role="img" aria-label={`Tendencia: ${valores.join(", ")}`} className="inline-block">
			<BarChart
				width={44}
				height={20}
				data={datos}
				margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
				barCategoryGap={1}
			>
				<Bar dataKey="valor" isAnimationActive={false}>
					{datos.map((dato) => (
						<Cell
							key={dato.i}
							fill={dato.i === datos.length - 1 ? colorDeLaUltima[tono ?? "normal"] : colorDeLasAnteriores}
						/>
					))}
				</Bar>
			</BarChart>
		</span>
	);
}
