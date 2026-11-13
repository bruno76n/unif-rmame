/**
 * La pestaña Pedidos de Tienda en línea.
 * Fase 19 · docs/interfaz/fabrica/tienda-en-linea.md («Pedidos»)
 *
 * La ruta solo arma la pantalla: el buscador y el cajón abierto vienen de la dirección.
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeLinea } from "../../departamentos/linea/direccion.ts";
import { PaginaDeLinea } from "../../departamentos/linea/pagina.tsx";
import { PestanaPedidos } from "../../departamentos/linea/pestanas/pedidos.tsx";

export const Route = createFileRoute("/linea/pedidos")({
	validateSearch: busquedaDeLinea,
	component: () => (
		<PaginaDeLinea activa="pedidos">
			<PestanaPedidos />
		</PaginaDeLinea>
	),
});
