/**
 * Bitácora de Catálogo: el buscador «Producto, persona o código», el tipo de cambio y la lista de precios, «{n} cambios»
 * y la tabla Fecha · Quién · Qué · Producto · Detalle, lo más reciente arriba. Tocar un renglón abre la ficha; «Ver más»
 * trae la página siguiente.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Bitácora»)
 */

import { useInfiniteQuery } from "@tanstack/react-query";
import { bitacoraDeCatalogo, tiposDeCambio } from "@uniformame/compartido/contratos/catalogo/pantallas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Panel } from "@uniformame/interfaz/pagina/panel";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { consultar } from "../../../comun/api.tsx";
import { conFicha, useBusqueda, useIr } from "../direccion.ts";
import { cuantos, diaYHora } from "../textos.ts";

/** Cómo se dice cada tipo de cambio. */
const nombreDelTipo: Readonly<Record<(typeof tiposDeCambio)[number], string>> = {
	precio: "Cambio de precio",
	producto_nuevo: "Producto nuevo",
	variante_baja: "Variante dada de baja",
	descontinuado: "Descontinuado",
	reactivado: "Reactivado",
	talla_agregada: "Talla agregada",
	canal: "Canal de venta",
	categoria: "Categoría de mayoreo",
};

/**
 * Lee un tipo de cambio de la dirección.
 * @param texto Lo que trae la dirección.
 */
function tipoDe(texto: string | undefined): (typeof tiposDeCambio)[number] | undefined {
	return tiposDeCambio.find((tipo) => tipo === texto);
}

/** Bitácora. */
export function PestanaBitacora() {
	const busqueda = useBusqueda();
	const ir = useIr();
	const tipo = tipoDe(busqueda.tipo);
	const parametros = {
		...(busqueda.buscar === undefined ? {} : { buscar: busqueda.buscar }),
		...(tipo === undefined ? {} : { tipo_cambio: tipo }),
		...(busqueda.lista === undefined ? {} : { lista_id: busqueda.lista }),
	};
	const paginas = useInfiniteQuery({
		queryKey: [bitacoraDeCatalogo.nombre, parametros],
		queryFn: ({ pageParam }) =>
			consultar(bitacoraDeCatalogo, pageParam === null ? parametros : { ...parametros, cursor: pageParam }),
		initialPageParam: null as string | null,
		getNextPageParam: (ultima) => ultima.cursor,
		retry: false,
	});
	const primera = paginas.data?.pages[0];
	const renglones = paginas.data?.pages.flatMap((pagina) => pagina.renglones) ?? [];
	return (
		<>
			<div className="grid grid-cols-[2fr_1fr_1fr_auto] items-end gap-3 max-menu:grid-cols-2 max-telefono:grid-cols-1">
				<Campo
					etiqueta="Buscar"
					placeholder="Producto, persona o código"
					type="search"
					defaultValue={busqueda.buscar ?? ""}
					onChange={(evento) => ir({ buscar: evento.target.value.trim() || undefined })}
				/>
				<Selector
					etiqueta="Tipo de cambio"
					vacio="Todos los cambios"
					opciones={tiposDeCambio.map((uno) => ({ valor: uno, texto: nombreDelTipo[uno] }))}
					value={tipo ?? ""}
					onChange={(evento) => ir({ tipo: evento.target.value || undefined })}
				/>
				<Selector
					etiqueta="Lista de precios"
					vacio="Todas las listas"
					opciones={(primera?.listas ?? []).map((lista) => ({ valor: lista.id, texto: lista.nombre }))}
					value={busqueda.lista ?? ""}
					onChange={(evento) => ir({ lista: evento.target.value || undefined })}
				/>
				<span className="pb-3 text-tinta2 tabular-nums">
					{primera === undefined ? "" : cuantos(primera.total, "cambio", "cambios")}
				</span>
			</div>
			{paginas.isError ? (
				<EstadoDePantalla tipo="error" alReintentar={() => void paginas.refetch()} />
			) : primera === undefined ? (
				<EstadoDePantalla tipo="cargando" />
			) : renglones.length === 0 ? (
				<EstadoDePantalla tipo="vacio" texto="Ningún cambio cumple esos filtros." />
			) : (
				<Panel>
					<Tabla
						nombre="Bitácora de Catálogo"
						filas={renglones}
						claveDeFila={(renglon) => renglon.id}
						alTocarFila={(renglon) => (renglon.producto_id === null ? undefined : ir(conFicha(renglon.producto_id)))}
						columnas={[
							{ clave: "fecha", encabezado: "Fecha", celda: (renglon) => diaYHora(renglon.ocurrido_en) },
							{ clave: "quien", encabezado: "Quién", celda: (renglon) => renglon.quien },
							{
								clave: "que",
								encabezado: "Qué",
								celda: (renglon) => (renglon.tipo_cambio === null ? "Cambio" : nombreDelTipo[renglon.tipo_cambio]),
							},
							{
								clave: "producto",
								encabezado: "Producto",
								celda: (renglon) => (
									<span className="flex flex-col">
										<b>{renglon.producto ?? "—"}</b>
										<span className="text-etiqueta text-tinta2">{renglon.escuela ?? "Básico"}</span>
									</span>
								),
							},
							{ clave: "detalle", encabezado: "Detalle", celda: (renglon) => renglon.detalle },
						]}
					/>
					{paginas.hasNextPage ? (
						<div className="flex justify-center pt-3">
							<Boton
								variante="secundario"
								disabled={paginas.isFetchingNextPage}
								onClick={() => void paginas.fetchNextPage()}
							>
								Ver más
							</Boton>
						</div>
					) : null}
				</Panel>
			)}
		</>
	);
}
