/**
 * Materiales de Bodega: la ruta solo arma la pantalla; su pestaña lee `inventario.materiales`.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Materiales»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeBodega } from "../../departamentos/bodega/direccion.ts";
import { PaginaDeBodega } from "../../departamentos/bodega/pagina.tsx";
import { MaterialesDeBodega } from "../../departamentos/bodega/pestanas/materiales.tsx";

/** La pantalla de Materiales. */
function Materiales() {
	return (
		<PaginaDeBodega activa="materiales">
			<MaterialesDeBodega />
		</PaginaDeBodega>
	);
}

export const Route = createFileRoute("/bodega/materiales")({
	validateSearch: busquedaDeBodega,
	component: Materiales,
});
