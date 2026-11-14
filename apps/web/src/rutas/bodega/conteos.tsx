/**
 * Conteos y ajustes de Bodega: la ruta solo arma la pantalla; su pestaña lee `inventario.conteos_y_ajustes` y pide lo
 * demás por páginas.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Conteos y ajustes»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeBodega } from "../../departamentos/bodega/direccion.ts";
import { PaginaDeBodega } from "../../departamentos/bodega/pagina.tsx";
import { ConteosDeBodega } from "../../departamentos/bodega/pestanas/conteos.tsx";

/** La pantalla de Conteos y ajustes. */
function ConteosYajustes() {
	return (
		<PaginaDeBodega activa="conteos">
			<ConteosDeBodega />
		</PaginaDeBodega>
	);
}

export const Route = createFileRoute("/bodega/conteos")({
	validateSearch: busquedaDeBodega,
	component: ConteosYajustes,
});
