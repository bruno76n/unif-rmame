/**
 * La pestaña Contador externo de Contaduría.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Contador externo»)
 *
 * La ruta solo arma la pantalla: sus filtros, el cajón abierto y la ventana vienen de la dirección.
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeContaduria } from "../../departamentos/contaduria/direccion.ts";
import { PaginaDeContaduria } from "../../departamentos/contaduria/pagina.tsx";
import { PestanaContadorExterno } from "../../departamentos/contaduria/pestanas/contador-externo.tsx";

export const Route = createFileRoute("/contaduria/contador-externo")({
	validateSearch: busquedaDeContaduria,
	component: () => (
		<PaginaDeContaduria activa="contador-externo">
			<PestanaContadorExterno />
		</PaginaDeContaduria>
	),
});
