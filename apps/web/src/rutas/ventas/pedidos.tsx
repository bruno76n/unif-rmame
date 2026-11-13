/**
 * La pestaña Pedidos de Ventas a externos.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Pedidos»)
 *
 * La ruta solo arma la pantalla: sus filtros y el cajón abierto vienen de la dirección.
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeVentas } from "../../departamentos/ventas/direccion.ts";
import { PaginaDeVentas } from "../../departamentos/ventas/pagina.tsx";
import { PestanaPedidos } from "../../departamentos/ventas/pestanas/pedidos.tsx";

export const Route = createFileRoute("/ventas/pedidos")({
	validateSearch: busquedaDeVentas,
	component: () => (
		<PaginaDeVentas activa="pedidos">
			<PestanaPedidos />
		</PaginaDeVentas>
	),
});
