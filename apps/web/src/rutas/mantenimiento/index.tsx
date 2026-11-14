/**
 * Pendientes de Mantenimiento, la primera pestaña: la ruta solo arma la pantalla; su pestaña lee
 * `mantenimiento.pendientes`.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Pendientes»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeMantenimiento } from "../../departamentos/mantenimiento/direccion.ts";
import { PaginaDeMantenimiento } from "../../departamentos/mantenimiento/pagina.tsx";
import { PendientesDeMantenimiento } from "../../departamentos/mantenimiento/pestanas/pendientes.tsx";

/** La pantalla de Pendientes. */
function Pendientes() {
	return (
		<PaginaDeMantenimiento activa="pendientes">
			<PendientesDeMantenimiento />
		</PaginaDeMantenimiento>
	);
}

export const Route = createFileRoute("/mantenimiento/")({
	validateSearch: busquedaDeMantenimiento,
	component: Pendientes,
});
