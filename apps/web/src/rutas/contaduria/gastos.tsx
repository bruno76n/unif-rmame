/**
 * La pestaña Gastos de Contaduría.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Gastos»)
 *
 * La ruta solo arma la pantalla: sus filtros, el cajón abierto y la ventana vienen de la dirección.
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeContaduria } from "../../departamentos/contaduria/direccion.ts";
import { PaginaDeContaduria } from "../../departamentos/contaduria/pagina.tsx";
import { PestanaGastos } from "../../departamentos/contaduria/pestanas/gastos.tsx";

export const Route = createFileRoute("/contaduria/gastos")({
	validateSearch: busquedaDeContaduria,
	component: () => (
		<PaginaDeContaduria activa="gastos">
			<PestanaGastos />
		</PaginaDeContaduria>
	),
});
