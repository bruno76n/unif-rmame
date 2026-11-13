/**
 * La pestaña Terceros de Contaduría.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Terceros»)
 *
 * La ruta solo arma la pantalla: sus filtros, el cajón abierto y la ventana vienen de la dirección.
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeContaduria } from "../../departamentos/contaduria/direccion.ts";
import { PaginaDeContaduria } from "../../departamentos/contaduria/pagina.tsx";
import { PestanaTerceros } from "../../departamentos/contaduria/pestanas/terceros.tsx";

export const Route = createFileRoute("/contaduria/terceros")({
	validateSearch: busquedaDeContaduria,
	component: () => (
		<PaginaDeContaduria activa="terceros">
			<PestanaTerceros />
		</PaginaDeContaduria>
	),
});
