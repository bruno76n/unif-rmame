/**
 * Conciliación de facturas: «Orden, recepción y factura», cuántas no coinciden, y la tabla Factura · Proveedor · los
 * tres puntos · Qué no cuadra · Estado. Solo consulta: se resuelve en Contaduría. Tocar un renglón abre su orden.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Conciliación de facturas»)
 */

import { plural } from "@uniformame/compartido/calculos/textos";
import type { conciliacionFacturas } from "@uniformame/compartido/contratos/compras/consultas-pestanas";

import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { CircleCheck, CircleDashed, CircleX } from "lucide-react";
import type { z } from "zod";
import { useDireccionDeCompras } from "../direccion.ts";

/** Un renglón de la conciliación. */
type Renglon = z.infer<typeof conciliacionFacturas.resultado>["renglones"][number];
/** Un punto: orden, recepción o factura. */
type Punto = Renglon["puntos"]["orden"];

/** Cómo se pinta cada punto: verde si coincide, rojo si no, gris punteado si todavía no existe. */
const comoSePinta = {
	coincide: { icono: CircleCheck, clase: "text-estado-verde", texto: "text-tinta2" },
	no_coincide: { icono: CircleX, clase: "text-estado-rojo", texto: "font-semibold text-texto-error" },
	falta: { icono: CircleDashed, clase: "text-estado-gris", texto: "text-tinta3" },
} as const;

/**
 * Un punto con su nombre y lo que dice.
 * @param props El nombre y el punto.
 */
function PuntoDeConciliacion({ nombre, punto }: { nombre: string; punto: Punto }) {
	const { icono: Icono, clase, texto } = comoSePinta[punto.como];
	return (
		<span className="flex min-w-28 flex-col gap-0.5">
			<Icono aria-hidden="true" size={18} strokeWidth={2.2} className={clase} />
			<b className="font-semibold">{nombre}</b>
			<span className={`text-etiqueta ${texto}`}>{punto.texto}</span>
		</span>
	);
}

/**
 * La pestaña Conciliación de facturas.
 * @param props Los renglones de `compras.conciliacion_facturas`.
 */
export function ConciliacionDeCompras({ renglones }: { renglones: Renglon[] }) {
	const { ir } = useDireccionDeCompras();
	return (
		<div className="flex flex-col gap-4">
			<div>
				<h2 className="m-0 font-bold text-subtitulo">Orden, recepción y factura</h2>
				{renglones.length === 0 ? null : (
					<p className="m-0 text-etiqueta text-tinta2">
						{plural(renglones.length, "factura no coincide", "facturas no coinciden")} en alguno de los tres puntos
					</p>
				)}
			</div>
			{renglones.length === 0 ? (
				<EstadoDePantalla tipo="vacio" texto="Todas las facturas cuadran con su orden y su recepción." bien />
			) : (
				<div className="rounded-grande bg-panel px-2 shadow-panel">
					<Tabla
						nombre="Conciliación de facturas"
						filas={renglones}
						claveDeFila={(renglon) => renglon.clave}
						alTocarFila={(renglon) => ir({ cajon: "orden", id: renglon.orden_compra_id })}
						columnas={[
							{
								clave: "factura",
								encabezado: "Factura",
								celda: (renglon) => (
									<span className="flex flex-col">
										<b className="font-bold">{renglon.factura ?? "Sin factura"}</b>
										<span className="text-etiqueta text-tinta2">
											{renglon.orden}
											{renglon.folio_proveedor === null ? "" : ` · Su folio ${renglon.folio_proveedor}`}
										</span>
									</span>
								),
							},
							{
								clave: "proveedor",
								encabezado: "Proveedor",
								celda: (renglon) => (
									<span className="flex flex-col">
										<b className="font-semibold">{renglon.proveedor}</b>
										<span className="text-etiqueta text-tinta2">{renglon.condicion}</span>
									</span>
								),
							},
							{
								clave: "puntos",
								encabezado: "Orden · Recepción · Factura",
								celda: ({ puntos }) => (
									<span className="flex gap-4">
										<PuntoDeConciliacion nombre="Orden" punto={puntos.orden} />
										<PuntoDeConciliacion nombre="Recepción" punto={puntos.recepcion} />
										<PuntoDeConciliacion nombre="Factura" punto={puntos.factura} />
									</span>
								),
							},
							{
								clave: "que_no_cuadra",
								encabezado: "Qué no cuadra",
								celda: (renglon) => <span className="block max-w-64 whitespace-normal">{renglon.que_no_cuadra}</span>,
							},
							{
								clave: "estado",
								encabezado: "Estado",
								celda: ({ estado }) => <Estado texto={estado.texto} color={estado.color} />,
							},
						]}
					/>
				</div>
			)}
		</div>
	);
}
