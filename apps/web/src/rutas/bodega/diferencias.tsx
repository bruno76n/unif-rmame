/**
 * Diferencias de Bodega: la ruta solo arma la pantalla; su pestaña lee `inventario.diferencias` y pide las resueltas por
 * páginas.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Diferencias»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeBodega } from "../../departamentos/bodega/direccion.ts";
import { PaginaDeBodega } from "../../departamentos/bodega/pagina.tsx";
import { DiferenciasDeBodega } from "../../departamentos/bodega/pestanas/diferencias.tsx";

/** La pantalla de Diferencias. */
function Diferencias() {
	return (
		<PaginaDeBodega activa="diferencias">
			<DiferenciasDeBodega />
		</PaginaDeBodega>
	);
}

export const Route = createFileRoute("/bodega/diferencias")({
	validateSearch: busquedaDeBodega,
	component: Diferencias,
});
