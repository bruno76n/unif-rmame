/**
 * Fallas de Mantenimiento: la ruta solo arma la pantalla; su pestaña lee las abiertas de `mantenimiento.fallas` y pide
 * las resueltas por páginas al desplegarlas.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Fallas»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeMantenimiento } from "../../departamentos/mantenimiento/direccion.ts";
import { PaginaDeMantenimiento } from "../../departamentos/mantenimiento/pagina.tsx";
import { FallasDeMantenimiento } from "../../departamentos/mantenimiento/pestanas/fallas.tsx";

/** La pantalla de Fallas. */
function Fallas() {
	return (
		<PaginaDeMantenimiento activa="fallas">
			<FallasDeMantenimiento />
		</PaginaDeMantenimiento>
	);
}

export const Route = createFileRoute("/mantenimiento/fallas")({
	validateSearch: busquedaDeMantenimiento,
	component: Fallas,
});
