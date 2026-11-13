/**
 * Servicios de Mantenimiento: lee el año de la dirección y entrega la pestaña, que pide `mantenimiento.servicios` por
 * páginas.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Servicios»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeMantenimiento, useDireccionDeMantenimiento } from "../../departamentos/mantenimiento/direccion.ts";
import { PaginaDeMantenimiento } from "../../departamentos/mantenimiento/pagina.tsx";
import { ServiciosDeMantenimiento } from "../../departamentos/mantenimiento/pestanas/servicios.tsx";

/** La pantalla de Servicios. */
function Servicios() {
	const { busqueda } = useDireccionDeMantenimiento();
	return (
		<PaginaDeMantenimiento activa="servicios">
			<ServiciosDeMantenimiento anio={busqueda.anio} />
		</PaginaDeMantenimiento>
	);
}

export const Route = createFileRoute("/mantenimiento/servicios")({
	validateSearch: busquedaDeMantenimiento,
	component: Servicios,
});
