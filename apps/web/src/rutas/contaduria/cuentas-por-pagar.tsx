/**
 * La pestaña Cuentas por pagar de Contaduría.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Cuentas por pagar»)
 *
 * La ruta solo arma la pantalla: sus filtros, el cajón abierto y la ventana vienen de la dirección.
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeContaduria } from "../../departamentos/contaduria/direccion.ts";
import { PaginaDeContaduria } from "../../departamentos/contaduria/pagina.tsx";
import { PestanaCuentasPorPagar } from "../../departamentos/contaduria/pestanas/cuentas-por-pagar.tsx";

export const Route = createFileRoute("/contaduria/cuentas-por-pagar")({
	validateSearch: busquedaDeContaduria,
	component: () => (
		<PaginaDeContaduria activa="cuentas-por-pagar">
			<PestanaCuentasPorPagar />
		</PaginaDeContaduria>
	),
});
