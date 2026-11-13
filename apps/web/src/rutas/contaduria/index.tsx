/**
 * Pendientes de Contaduría: la primera pestaña.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Pendientes»)
 *
 * La ruta solo arma la pantalla: sus filtros, el cajón abierto y la ventana vienen de la dirección.
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeContaduria } from "../../departamentos/contaduria/direccion.ts";
import { PaginaDeContaduria } from "../../departamentos/contaduria/pagina.tsx";
import { PestanaPendientes } from "../../departamentos/contaduria/pestanas/pendientes.tsx";

export const Route = createFileRoute("/contaduria/")({
	validateSearch: busquedaDeContaduria,
	component: () => (
		<PaginaDeContaduria activa="pendientes">
			<PestanaPendientes />
		</PaginaDeContaduria>
	),
});
