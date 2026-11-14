/**
 * Máquinas de Mantenimiento: la ruta solo arma la pantalla; su pestaña lee `mantenimiento.maquinas`.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Máquinas»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeMantenimiento } from "../../departamentos/mantenimiento/direccion.ts";
import { PaginaDeMantenimiento } from "../../departamentos/mantenimiento/pagina.tsx";
import { MaquinasDeMantenimiento } from "../../departamentos/mantenimiento/pestanas/maquinas.tsx";

/** La pantalla de Máquinas. */
function Maquinas() {
	return (
		<PaginaDeMantenimiento activa="maquinas">
			<MaquinasDeMantenimiento />
		</PaginaDeMantenimiento>
	);
}

export const Route = createFileRoute("/mantenimiento/maquinas")({
	validateSearch: busquedaDeMantenimiento,
	component: Maquinas,
});
