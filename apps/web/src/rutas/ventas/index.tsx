/**
 * Pendientes de Ventas a externos: la primera pestaña.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Pendientes»)
 *
 * La ruta solo arma la pantalla: sus filtros y el cajón abierto vienen de la dirección.
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeVentas } from "../../departamentos/ventas/direccion.ts";
import { PaginaDeVentas } from "../../departamentos/ventas/pagina.tsx";
import { PestanaPendientes } from "../../departamentos/ventas/pestanas/pendientes.tsx";

export const Route = createFileRoute("/ventas/")({
	validateSearch: busquedaDeVentas,
	component: () => (
		<PaginaDeVentas activa="pendientes">
			<PestanaPendientes />
		</PaginaDeVentas>
	),
});
