/**
 * Servicios de Mantenimiento: la ruta solo arma la pantalla; su pestaña lee `mantenimiento.servicios` por páginas con
 * el año de la dirección.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Servicios»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeMantenimiento } from "../../departamentos/mantenimiento/direccion.ts";
import { PaginaDeMantenimiento } from "../../departamentos/mantenimiento/pagina.tsx";
import { ServiciosDeMantenimiento } from "../../departamentos/mantenimiento/pestanas/servicios.tsx";

/** La pantalla de Servicios. */
function Servicios() {
	return (
		<PaginaDeMantenimiento activa="servicios">
			<ServiciosDeMantenimiento />
		</PaginaDeMantenimiento>
	);
}

export const Route = createFileRoute("/mantenimiento/servicios")({
	validateSearch: busquedaDeMantenimiento,
	component: Servicios,
});
