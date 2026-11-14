/**
 * Reabasto de Bodega: la ruta solo arma la pantalla; su pestaña lee `inventario.reabasto`.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Reabasto»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeBodega } from "../../departamentos/bodega/direccion.ts";
import { PaginaDeBodega } from "../../departamentos/bodega/pagina.tsx";
import { ReabastoDeBodega } from "../../departamentos/bodega/pestanas/reabasto.tsx";

/** La pantalla de Reabasto. */
function Reabasto() {
	return (
		<PaginaDeBodega activa="reabasto">
			<ReabastoDeBodega />
		</PaginaDeBodega>
	);
}

export const Route = createFileRoute("/bodega/reabasto")({
	validateSearch: busquedaDeBodega,
	component: Reabasto,
});
