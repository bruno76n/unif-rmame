/**
 * Pendientes de Tienda en línea: la primera pestaña.
 * Fase 19 · docs/interfaz/fabrica/tienda-en-linea.md («Pendientes»)
 *
 * La ruta solo arma la pantalla: el cajón abierto viene de la dirección.
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeLinea } from "../../departamentos/linea/direccion.ts";
import { PaginaDeLinea } from "../../departamentos/linea/pagina.tsx";
import { PestanaPendientes } from "../../departamentos/linea/pestanas/pendientes.tsx";

export const Route = createFileRoute("/linea/")({
	validateSearch: busquedaDeLinea,
	component: () => (
		<PaginaDeLinea activa="pendientes">
			<PestanaPendientes />
		</PaginaDeLinea>
	),
});
