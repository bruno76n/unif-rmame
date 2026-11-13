/**
 * La pestaña Clientes de Ventas a externos.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Clientes»)
 *
 * La ruta solo arma la pantalla: sus filtros y el cajón abierto vienen de la dirección.
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeVentas } from "../../departamentos/ventas/direccion.ts";
import { PaginaDeVentas } from "../../departamentos/ventas/pagina.tsx";
import { PestanaClientes } from "../../departamentos/ventas/pestanas/clientes.tsx";

export const Route = createFileRoute("/ventas/clientes")({
	validateSearch: busquedaDeVentas,
	component: () => (
		<PaginaDeVentas activa="clientes">
			<PestanaClientes />
		</PaginaDeVentas>
	),
});
