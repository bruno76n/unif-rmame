/**
 * La pestaña Notas de entrega de Ventas a externos.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Notas de entrega»)
 *
 * La ruta solo arma la pantalla: sus filtros y el cajón abierto vienen de la dirección.
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeVentas } from "../../departamentos/ventas/direccion.ts";
import { PaginaDeVentas } from "../../departamentos/ventas/pagina.tsx";
import { PestanaNotas } from "../../departamentos/ventas/pestanas/notas.tsx";

export const Route = createFileRoute("/ventas/notas")({
	validateSearch: busquedaDeVentas,
	component: () => (
		<PaginaDeVentas activa="notas">
			<PestanaNotas />
		</PaginaDeVentas>
	),
});
