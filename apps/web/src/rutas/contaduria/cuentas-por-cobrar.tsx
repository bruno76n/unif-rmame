/**
 * La pestaña Cuentas por cobrar de Contaduría.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Cuentas por cobrar»)
 *
 * La ruta solo arma la pantalla: sus filtros, el cajón abierto y la ventana vienen de la dirección.
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeContaduria } from "../../departamentos/contaduria/direccion.ts";
import { PaginaDeContaduria } from "../../departamentos/contaduria/pagina.tsx";
import { PestanaCuentasPorCobrar } from "../../departamentos/contaduria/pestanas/cuentas-por-cobrar.tsx";

export const Route = createFileRoute("/contaduria/cuentas-por-cobrar")({
	validateSearch: busquedaDeContaduria,
	component: () => (
		<PaginaDeContaduria activa="cuentas-por-cobrar">
			<PestanaCuentasPorCobrar />
		</PaginaDeContaduria>
	),
});
