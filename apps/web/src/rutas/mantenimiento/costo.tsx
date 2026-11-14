/**
 * Costo por máquina de Mantenimiento: la ruta solo arma la pantalla; su pestaña lee `mantenimiento.costo_por_maquina`
 * con el costo de la hora escrito en la pantalla, que va en la dirección.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Costo por máquina»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeMantenimiento } from "../../departamentos/mantenimiento/direccion.ts";
import { PaginaDeMantenimiento } from "../../departamentos/mantenimiento/pagina.tsx";
import { CostoDeMantenimiento } from "../../departamentos/mantenimiento/pestanas/costo.tsx";

/** La pantalla de Costo por máquina. */
function Costo() {
	return (
		<PaginaDeMantenimiento activa="costo">
			<CostoDeMantenimiento />
		</PaginaDeMantenimiento>
	);
}

export const Route = createFileRoute("/mantenimiento/costo")({
	validateSearch: busquedaDeMantenimiento,
	component: Costo,
});
