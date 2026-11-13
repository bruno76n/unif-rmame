/**
 * La pestaña Nómina de Contaduría.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Nómina»)
 *
 * La ruta solo arma la pantalla: sus filtros, el cajón abierto y la ventana vienen de la dirección.
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeContaduria } from "../../departamentos/contaduria/direccion.ts";
import { PaginaDeContaduria } from "../../departamentos/contaduria/pagina.tsx";
import { PestanaNomina } from "../../departamentos/contaduria/pestanas/nomina.tsx";

export const Route = createFileRoute("/contaduria/nomina")({
	validateSearch: busquedaDeContaduria,
	component: () => (
		<PaginaDeContaduria activa="nomina">
			<PestanaNomina />
		</PaginaDeContaduria>
	),
});
