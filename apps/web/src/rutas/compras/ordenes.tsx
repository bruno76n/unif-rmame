/**
 * Órdenes de compra de Compras: la ruta solo arma la pantalla; su pestaña lee `compras.ordenes` con la búsqueda de la
 * dirección.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Órdenes de compra»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { PaginaDeCompras } from "../../departamentos/compras/pagina-de-compras.tsx";
import { OrdenesDeCompras } from "../../departamentos/compras/pestanas/ordenes.tsx";

/** La pantalla de Órdenes de compra. */
function Ordenes() {
	return (
		<PaginaDeCompras activa="ordenes">
			<OrdenesDeCompras />
		</PaginaDeCompras>
	);
}

export const Route = createFileRoute("/compras/ordenes")({ component: Ordenes });
