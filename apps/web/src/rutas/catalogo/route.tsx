/**
 * Catálogo: la página con sus pestañas y sus cajones; cada pestaña es una ruta hija y los filtros y los cajones van en la
 * búsqueda.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md y docs/cimientos/ESTRUCTURA.md («Las pantallas por dentro»)
 */

import { createFileRoute, Outlet } from "@tanstack/react-router";
import { busquedaDeCatalogo } from "../../departamentos/catalogo/direccion.ts";
import { PaginaDeCatalogo } from "../../departamentos/catalogo/pagina.tsx";

export const Route = createFileRoute("/catalogo")({
	validateSearch: busquedaDeCatalogo,
	component: () => (
		<PaginaDeCatalogo>
			<Outlet />
		</PaginaDeCatalogo>
	),
});
