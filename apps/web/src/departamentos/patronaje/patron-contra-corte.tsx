/**
 * La tabla «Patrón contra corte, por talla» (Talla · Patrón · Real · Desperdicio · Respaldo), que comparten la página
 * de la receta y el cajón Rendimiento. Todo llega escrito de su consulta.
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («La página de la receta» y «Cajones»: Rendimiento)
 */

import type { renglonPatronContraCorte } from "@uniformame/compartido/contratos/patronaje/receta";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import type { z } from "zod";

/** Un renglón de la tabla. */
type Renglon = z.infer<typeof renglonPatronContraCorte>;

/**
 * El respaldo de un dato: seis puntos y «{n} lotes», con «dato flojo» si son pocos.
 * @param props Cuántos lotes y si es flojo.
 */
export function Respaldo({ lotes, flojo }: { lotes: number; flojo: boolean }) {
	if (lotes === 0) return <span className="text-tinta3">Ningún lote</span>;
	return (
		<span
			className="inline-flex items-center gap-2"
			title={`${lotes} ${lotes === 1 ? "lote medido" : "lotes medidos"}`}
		>
			<span aria-hidden="true" className="inline-flex gap-0.5">
				{[0, 1, 2, 3, 4, 5].map((punto) => (
					<span
						key={punto}
						className={`size-1.5 rounded-full ${
							punto < lotes ? (flojo ? "bg-estado-ambar" : "bg-estado-verde") : "bg-linea2"
						}`}
					/>
				))}
			</span>
			<span className="tabular-nums">
				{lotes} {lotes === 1 ? "lote" : "lotes"}
				{flojo ? <em className="text-texto-advertencia"> · dato flojo</em> : null}
			</span>
		</span>
	);
}

/**
 * La tabla por talla.
 * @param props Sus renglones.
 */
export function TablaPatronContraCorte({ tallas }: { tallas: readonly Renglon[] }) {
	return (
		<Tabla
			nombre="Patrón contra corte, por talla"
			filas={tallas}
			claveDeFila={(renglon) => renglon.talla}
			columnas={[
				{
					clave: "talla",
					encabezado: "Talla",
					celda: (renglon) => (
						<b>
							{renglon.talla}
							{renglon.especial ? <span className="font-normal text-tinta3"> · Pedido especial</span> : null}
						</b>
					),
				},
				{ clave: "patron", encabezado: "Patrón", alinear: "derecha", celda: (renglon) => renglon.patron ?? "—" },
				{ clave: "real", encabezado: "Real", alinear: "derecha", celda: (renglon) => renglon.real ?? "—" },
				{
					clave: "desperdicio",
					encabezado: "Desperdicio",
					alinear: "derecha",
					celda: (renglon) =>
						renglon.desperdicio === null ? (
							<span className="text-tinta3">Sin medir</span>
						) : (
							<span className={renglon.alto ? "font-semibold text-texto-error" : undefined}>{renglon.desperdicio}</span>
						),
				},
				{
					clave: "respaldo",
					encabezado: "Respaldo",
					celda: (renglon) => <Respaldo lotes={renglon.lotes} flojo={renglon.flojo} />,
				},
			]}
		/>
	);
}
