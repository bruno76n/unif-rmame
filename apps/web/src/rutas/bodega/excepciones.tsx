/**
 * Excepciones de Bodega: la pestaña lee las por resolver y las resueltas de `inventario.excepciones`.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Excepciones»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeBodega } from "../../departamentos/bodega/direccion.ts";
import { PaginaDeBodega } from "../../departamentos/bodega/pagina.tsx";
import { ExcepcionesDeBodega } from "../../departamentos/bodega/pestanas/excepciones.tsx";

/** La pantalla de Excepciones. */
function Excepciones() {
	return (
		<PaginaDeBodega activa="excepciones">
			<ExcepcionesDeBodega />
		</PaginaDeBodega>
	);
}

export const Route = createFileRoute("/bodega/excepciones")({
	validateSearch: busquedaDeBodega,
	component: Excepciones,
});
