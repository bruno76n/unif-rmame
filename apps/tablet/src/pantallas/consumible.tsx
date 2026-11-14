/**
 * Tomar consumible: «¿Qué tomas?» con un contador por consumible (de 0 a `produccion.consumible_max_por_vez`) en su
 * unidad de la tablet, y «Tomar», apagado mientras todo está en 0.
 * Fase 20 · docs/interfaz/tablet.md («Tomar consumible»)
 */

import { BotonGrande, BotonVolver } from "@uniformame/interfaz/tablet/botones";
import { Contador } from "@uniformame/interfaz/tablet/captura";
import { PackageCheck } from "lucide-react";
import { useState } from "react";

/** Un consumible de «¿Qué tomas?». */
export interface ConsumibleDeLaTablet {
	id: string;
	nombre: string;
	unidad: string;
}

/**
 * «¿Qué tomas?».
 * @param props Los consumibles, el máximo por vez y qué hacer al tomar o al volver.
 */
export function QueTomas({
	consumibles,
	maximo,
	alTomar,
	alVolver,
}: {
	consumibles: readonly ConsumibleDeLaTablet[];
	maximo: number;
	alTomar: (tomados: { consumible: ConsumibleDeLaTablet; cantidad: number }[]) => void;
	alVolver: () => void;
}) {
	const [cantidades, setCantidades] = useState<Record<string, number>>({});
	const tomados = consumibles
		.map((consumible) => ({ consumible, cantidad: cantidades[consumible.id] ?? 0 }))
		.filter((tomado) => tomado.cantidad > 0);
	return (
		<section className="mx-auto flex max-w-245 flex-col gap-4.5">
			<BotonVolver onClick={alVolver}>Volver</BotonVolver>
			<h1 className="m-0 text-tablet-titulo tracking-tight">¿Qué tomas?</h1>
			{consumibles.length === 0 ? (
				<p className="m-0 rounded-[14px] bg-panel p-7 text-center font-semibold text-[18px] text-tinta3 shadow-panel">
					No hay consumibles dados de alta en Compras.
				</p>
			) : (
				<div className="grid grid-cols-3 gap-3 max-menu:grid-cols-1">
					{consumibles.map((consumible) => (
						<Contador
							key={consumible.id}
							chico
							etiqueta={consumible.nombre}
							valor={cantidades[consumible.id] ?? 0}
							maximo={maximo}
							unidad={consumible.unidad}
							tono={(cantidades[consumible.id] ?? 0) > 0 ? "elegido" : "normal"}
							alCambiar={(valor) => setCantidades((antes) => ({ ...antes, [consumible.id]: valor }))}
						/>
					))}
				</div>
			)}
			<BotonGrande icono={PackageCheck} disabled={tomados.length === 0} onClick={() => alTomar(tomados)}>
				Tomar
			</BotonGrande>
		</section>
	);
}
