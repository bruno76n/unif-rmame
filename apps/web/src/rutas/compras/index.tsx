/**
 * Pendientes de Compras, la primera pestaña: la ruta solo arma la pantalla; su pestaña lee `compras.pendientes`.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Pendientes»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { PaginaDeCompras } from "../../departamentos/compras/pagina-de-compras.tsx";
import { PendientesDeCompras } from "../../departamentos/compras/pestanas/pendientes.tsx";

/** La pantalla de Pendientes. */
function Pendientes() {
	return (
		<PaginaDeCompras activa="pendientes">
			<PendientesDeCompras />
		</PaginaDeCompras>
	);
}

export const Route = createFileRoute("/compras/")({ component: Pendientes });
