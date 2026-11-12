/**
 * La tabla de datos: encabezado gris de 48 px, renglones de 54 px, orden por columna, selección, renglón de suma y
 * renglón «agregar»; con muchos renglones, solo dibuja los que se ven (TanStack Virtual). En el teléfono se desplaza
 * de lado.
 * Fase 19 · docs/interfaz/DISENO.md («Tabla», «Medidas», reglas 7 y 10)
 *
 * Uso:
 * `<Tabla filas={pedidos} claveDeFila={(p) => p.id} columnas={[{ clave: "folio", encabezado: "Folio", celda: (p) =>
 * p.folio, ordenarPor: (p) => p.folio }, { clave: "total", encabezado: "Total", alinear: "derecha", celda: … }]} />`.
 * Las cifras van alineadas a la derecha y con números tabulares (`alinear: "derecha"`). La tabla no sabe del negocio:
 * cada celda la arma quien la usa.
 */

import {
	type ColumnDef,
	createSortedRowModel,
	type RowData,
	type RowSelectionState,
	rowSelectionFeature,
	rowSortingFeature,
	type SortingState,
	sortFn_basic,
	tableFeatures,
	useTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp } from "lucide-react";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { Casilla } from "../captura/casilla.tsx";
import { unirClases } from "../clases.ts";

/** Desde cuántos renglones la tabla solo dibuja los que se ven. */
export const renglonesParaVirtualizar = 100;

/** Las capacidades de la tabla del sistema. */
const capacidades = tableFeatures({
	rowSortingFeature,
	rowSelectionFeature,
	sortedRowModel: createSortedRowModel(),
	sortFns: { basic: sortFn_basic },
});

/** Una columna de la tabla. */
export interface ColumnaDeTabla<Fila extends RowData> {
	clave: string;
	encabezado: string;
	celda: (fila: Fila) => ReactNode;
	/** Con esto, la columna se ordena al tocar su encabezado. */
	ordenarPor?: (fila: Fila) => string | number;
	/** Las cifras y el dinero, a la derecha y con números tabulares. */
	alinear?: "izquierda" | "derecha";
	/** El total de la columna, en el renglón de suma. */
	suma?: ReactNode;
}

/** Lo que recibe una tabla. */
export interface PropsDeTabla<Fila extends RowData> {
	filas: readonly Fila[];
	columnas: readonly ColumnaDeTabla<Fila>[];
	claveDeFila: (fila: Fila) => string;
	/** Para el lector de pantalla: qué muestra la tabla. */
	nombre: string;
	/** Tocar un renglón (abrir su cajón). */
	alTocarFila?: (fila: Fila) => void;
	/** Con esto, cada renglón lleva su casilla; recibe las claves escogidas. */
	alSeleccionar?: (claves: string[]) => void;
	/** El renglón de abajo para agregar uno («Agregar talla»). */
	agregar?: ReactNode;
	/** El alto de la tabla cuando virtualiza; sin él, 600 px. */
	altoMaximo?: number;
}

/**
 * Una tabla del sistema.
 * @param props Las filas, las columnas, su clave, su nombre, y lo que pasa al tocar o escoger.
 */
export function Tabla<Fila extends RowData>({
	filas,
	columnas,
	claveDeFila,
	nombre,
	alTocarFila,
	alSeleccionar,
	agregar,
	altoMaximo = 600,
}: PropsDeTabla<Fila>) {
	const [orden, setOrden] = useState<SortingState>([]);
	const [seleccion, setSeleccion] = useState<RowSelectionState>({});
	const definiciones = useMemo<ColumnDef<typeof capacidades, Fila>[]>(
		() =>
			columnas.map((columna) => ({
				id: columna.clave,
				header: columna.encabezado,
				accessorFn: (fila: Fila) => columna.ordenarPor?.(fila) ?? 0,
				cell: ({ row }) => columna.celda(row.original),
				enableSorting: columna.ordenarPor !== undefined,
				sortFn: "basic",
			})),
		[columnas],
	);
	const datos = useMemo(() => [...filas], [filas]);
	const tabla = useTable({
		features: capacidades,
		columns: definiciones,
		data: datos,
		getRowId: (fila) => claveDeFila(fila),
		state: { sorting: orden, rowSelection: seleccion },
		onSortingChange: setOrden,
		onRowSelectionChange: (cambio) => {
			const nueva = typeof cambio === "function" ? cambio(seleccion) : cambio;
			setSeleccion(nueva);
			alSeleccionar?.(Object.keys(nueva).filter((clave) => nueva[clave] === true));
		},
	});
	const renglones = tabla.getRowModel().rows;
	const contenedor = useRef<HTMLDivElement>(null);
	const virtualiza = renglones.length > renglonesParaVirtualizar;
	const virtual = useVirtualizer({
		count: virtualiza ? renglones.length : 0,
		getScrollElement: () => contenedor.current,
		estimateSize: () => 54,
		overscan: 8,
	});
	const visibles = virtualiza
		? virtual.getVirtualItems().flatMap((item) => {
				const renglon = renglones[item.index];
				return renglon === undefined ? [] : [renglon];
			})
		: renglones;
	const conSuma = columnas.some((columna) => columna.suma !== undefined);
	const alineacion = (columna: ColumnaDeTabla<Fila> | undefined) =>
		columna?.alinear === "derecha" ? "text-right tabular-nums" : "text-left";
	return (
		<div
			ref={contenedor}
			className="overflow-x-auto max-telefono:-mx-4"
			style={virtualiza ? { maxHeight: altoMaximo, overflowY: "auto" } : undefined}
		>
			<table aria-label={nombre} className="w-full border-collapse">
				<thead className="sticky top-0 z-10">
					<tr className="h-encabezado-tabla bg-suave">
						{alSeleccionar === undefined ? null : <th className="w-10 px-3" aria-label="Escoger" />}
						{tabla.getHeaderGroups()[0]?.headers.map((encabezado) => {
							const columna = columnas.find((una) => una.clave === encabezado.column.id);
							const direccion = encabezado.column.getIsSorted();
							return (
								<th
									key={encabezado.id}
									scope="col"
									aria-sort={direccion === "asc" ? "ascending" : direccion === "desc" ? "descending" : undefined}
									className={unirClases(
										"whitespace-nowrap px-3 font-semibold text-etiqueta text-tinta3",
										alineacion(columna),
									)}
								>
									{encabezado.column.getCanSort() ? (
										<button
											type="button"
											onClick={encabezado.column.getToggleSortingHandler()}
											className="inline-flex items-center gap-1 hover:text-tinta"
										>
											{columna?.encabezado}
											{direccion === "asc" ? <ArrowUp aria-hidden="true" size={13} /> : null}
											{direccion === "desc" ? <ArrowDown aria-hidden="true" size={13} /> : null}
										</button>
									) : (
										columna?.encabezado
									)}
								</th>
							);
						})}
					</tr>
				</thead>
				<tbody>
					{virtualiza ? <tr style={{ height: virtual.getVirtualItems()[0]?.start ?? 0 }} /> : null}
					{visibles.map((renglon) => (
						<tr
							key={renglon.id}
							onClick={alTocarFila === undefined ? undefined : () => alTocarFila(renglon.original)}
							className={unirClases(
								"h-renglon border-linea border-b",
								alTocarFila === undefined ? undefined : "cursor-pointer hover:bg-suave",
								renglon.getIsSelected() ? "bg-marca-fondo" : undefined,
							)}
						>
							{alSeleccionar === undefined ? null : (
								<td className="px-3" onClick={(evento) => evento.stopPropagation()} onKeyDown={undefined}>
									<Casilla
										etiqueta={`Escoger ${renglon.id}`}
										sinTexto
										marcada={renglon.getIsSelected()}
										alCambiar={(marcada) => renglon.toggleSelected(marcada)}
									/>
								</td>
							)}
							{renglon.getAllCells().map((celda) => {
								const columna = columnas.find((una) => una.clave === celda.column.id);
								return (
									<td key={celda.id} className={unirClases("px-3 py-2 align-middle", alineacion(columna))}>
										{columna?.celda(renglon.original)}
									</td>
								);
							})}
						</tr>
					))}
					{virtualiza ? (
						<tr style={{ height: virtual.getTotalSize() - (virtual.getVirtualItems().at(-1)?.end ?? 0) }} />
					) : null}
					{agregar === undefined ? null : (
						<tr className="h-renglon">
							<td colSpan={columnas.length + (alSeleccionar === undefined ? 0 : 1)} className="px-3">
								{agregar}
							</td>
						</tr>
					)}
				</tbody>
				{conSuma ? (
					<tfoot>
						<tr className="h-renglon bg-suave font-bold">
							{alSeleccionar === undefined ? null : <td />}
							{columnas.map((columna) => (
								<td key={columna.clave} className={unirClases("px-3", alineacion(columna))}>
									{columna.suma}
								</td>
							))}
						</tr>
					</tfoot>
				) : null}
			</table>
		</div>
	);
}
