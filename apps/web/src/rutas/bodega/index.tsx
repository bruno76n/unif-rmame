/**
 * Pendientes de Bodega, la primera pestaña: la ruta solo arma la pantalla; su pestaña lee `inventario.bodega_pendientes`
 * con el filtro de la dirección.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Pendientes»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeBodega } from "../../departamentos/bodega/direccion.ts";
import { PaginaDeBodega } from "../../departamentos/bodega/pagina.tsx";
import { PendientesDeBodega } from "../../departamentos/bodega/pestanas/pendientes.tsx";

/** La pantalla de Pendientes. */
function Pendientes() {
	return (
		<PaginaDeBodega activa="pendientes">
			<PendientesDeBodega />
		</PaginaDeBodega>
	);
}

export const Route = createFileRoute("/bodega/")({
	validateSearch: busquedaDeBodega,
	component: Pendientes,
});
