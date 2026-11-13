/**
 * La ventana «Llenar {medida o material}»: «Talla de base» (la de en medio) · «Medida en esa talla» o «Cantidad en esa
 * talla» · «Cuánto sube por talla»; abajo la vista previa talla por talla (medidas a medio centímetro, lo demás a
 * centésimos). «Llenar {n} tallas» llena el renglón; el aviso dice «{medida o material}: {n} tallas llenas».
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («Ventanas»: «Llenar {medida o material}»)
 */

import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { useEffect, useState } from "react";
import { useAvisar } from "../../../comun/avisos-de-abajo.tsx";
import { limpiarCajita, valoresLlenados } from "../receta-en-pantalla.ts";

/** El renglón que se llena. */
export interface RenglonPorLlenar {
	/** La medida o el material. */
	nombre: string;
	/** «cm», «m», «pza». */
	unidad: string;
	esMedida: boolean;
	/** Lo que ya tiene cada talla. */
	valores: Readonly<Record<string, string>>;
}

/**
 * La ventana para llenar un renglón desde una talla.
 * @param props El renglón (cerrada si es nulo), las tallas, la de en medio, qué hacer con lo llenado y al cerrar.
 */
export function VentanaLlenar({
	renglon,
	tallas,
	tallaBaseId,
	alLlenar,
	alCerrar,
}: {
	renglon: RenglonPorLlenar | null;
	tallas: readonly { talla_id: string; nombre: string }[];
	tallaBaseId: string | null;
	alLlenar: (valores: Record<string, string>) => void;
	alCerrar: () => void;
}) {
	const avisar = useAvisar();
	const [base, setBase] = useState({ talla: "", valor: "", paso: "" });
	useEffect(() => {
		if (renglon === null) return;
		const talla = tallaBaseId ?? tallas[0]?.talla_id ?? "";
		setBase({ talla, valor: renglon.valores[talla] ?? "", paso: "" });
	}, [renglon, tallaBaseId, tallas]);
	const llenados =
		renglon === null ? null : valoresLlenados(tallas, base.talla, base.valor, base.paso, renglon.esMedida);
	return (
		<Ventana
			abierta={renglon !== null}
			alCerrar={alCerrar}
			titulo={`Llenar ${renglon?.nombre.toLocaleLowerCase("es-MX") ?? ""}`}
			accion={
				<Boton
					variante="principal"
					disabled={llenados === null}
					onClick={() => {
						if (llenados === null || renglon === null) return;
						alLlenar(llenados);
						avisar(`${renglon.nombre}: ${tallas.length} tallas llenas`, "bien");
						alCerrar();
					}}
				>
					Llenar {tallas.length} tallas
				</Boton>
			}
		>
			<div className="flex flex-col gap-4">
				<div className="grid grid-cols-2 gap-4">
					<Selector
						etiqueta="Talla de base"
						enVentana
						value={base.talla}
						opciones={tallas.map((talla) => ({ valor: talla.talla_id, texto: talla.nombre }))}
						onChange={(evento) => setBase({ ...base, talla: evento.target.value })}
					/>
					<Campo
						etiqueta={`${renglon?.esMedida === true ? "Medida" : "Cantidad"} en esa talla (${renglon?.unidad ?? ""})`}
						enVentana
						inputMode="decimal"
						value={base.valor}
						onChange={(evento) => setBase({ ...base, valor: limpiarCajita(evento.target.value) })}
					/>
				</div>
				<Campo
					etiqueta={`Cuánto sube por talla (${renglon?.unidad ?? ""})`}
					enVentana
					inputMode="decimal"
					value={base.paso}
					onChange={(evento) => setBase({ ...base, paso: limpiarCajita(evento.target.value) })}
				/>
				<dl aria-label="Vista previa" className="m-0 flex flex-wrap gap-2">
					{tallas.map((talla) => (
						<div key={talla.talla_id} className="flex min-w-14 flex-col items-center rounded-chico bg-suave px-2 py-1">
							<dt className="text-etiqueta text-tinta3">{talla.nombre}</dt>
							<dd className="m-0 font-bold tabular-nums">{llenados?.[talla.talla_id] ?? "—"}</dd>
						</div>
					))}
				</dl>
			</div>
		</Ventana>
	);
}
