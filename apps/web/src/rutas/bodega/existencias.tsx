/**
 * Existencias de Bodega: la pestaña pide `inventario.existencias` por páginas con la búsqueda y los filtros de la dirección.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Existencias»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeBodega } from "../../departamentos/bodega/direccion.ts";
import { PaginaDeBodega } from "../../departamentos/bodega/pagina.tsx";
import { ExistenciasDeBodega } from "../../departamentos/bodega/pestanas/existencias.tsx";

/** La pantalla de Existencias. */
function Existencias() {
	return (
		<PaginaDeBodega activa="existencias">
			<ExistenciasDeBodega />
		</PaginaDeBodega>
	);
}

export const Route = createFileRoute("/bodega/existencias")({
	validateSearch: busquedaDeBodega,
	component: Existencias,
});
