/**
 * Los estados de una lista que pagina (`usePaginas`): los mismos de `SegunConsulta` mientras llega la primera página
 * (cargando, sin conexión, sin permiso y error con «Reintentar») y, con las páginas, la pantalla con su «Ver más».
 * Fase 19 · docs/interfaz/comunes.md («Los estados de una pantalla») y docs/interfaz/fabrica/contaduria.md («Las
 * listas largas se paginan»)
 *
 * Uso: `<SegunPaginas paginas={usePaginas(...)}>{({ primera, todas, verMas }) => <Lista ... />}</SegunPaginas>`.
 */

import type { InfiniteData, UseInfiniteQueryResult } from "@tanstack/react-query";
import { Boton } from "@uniformame/interfaz/botones/boton";
import type { ReactNode } from "react";
import { SegunConsulta } from "./segun-consulta.tsx";

/** Lo que recibe la pantalla de una lista que pagina. */
export interface PaginasLeidas<Pagina> {
	/** La primera página: la que trae lo que no se pagina (las cifras, los filtros, los permisos). */
	primera: Pagina;
	/** Todas las páginas leídas, en orden. */
	todas: readonly Pagina[];
	/** El botón «Ver más» si hay otra página, o nada; la pantalla lo pone donde va. */
	verMas: ReactNode;
}

/**
 * Pinta los estados de una lista que pagina y, con sus páginas, la pantalla.
 * @param props Las páginas de `usePaginas`, cuántos renglones grises mientras carga y la pantalla con lo leído.
 * Existe para que ninguna lista larga pinte sus estados a mano y pierda «sin permiso» o «sin conexión».
 */
export function SegunPaginas<Pagina>({
	paginas,
	renglones = 5,
	children,
}: {
	paginas: UseInfiniteQueryResult<InfiniteData<Pagina>>;
	renglones?: number;
	children: (leidas: PaginasLeidas<Pagina>) => ReactNode;
}) {
	const verMas = paginas.hasNextPage ? (
		<Boton
			chico
			variante="secundario"
			disabled={paginas.isFetchingNextPage}
			onClick={() => void paginas.fetchNextPage()}
		>
			Ver más
		</Boton>
	) : null;
	return (
		<SegunConsulta consulta={paginas} renglones={renglones}>
			{(datos) => {
				// Con datos, TanStack Query siempre trae al menos la primera página.
				const [primera] = datos.pages;
				return primera === undefined ? null : children({ primera, todas: datos.pages, verMas });
			}}
		</SegunConsulta>
	);
}
