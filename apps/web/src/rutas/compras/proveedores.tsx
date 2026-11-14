/**
 * Proveedores de Compras: la ruta solo arma la pantalla; su pestaña lee `compras.proveedores` con la búsqueda y «Dados
 * de baja» de la dirección.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Proveedores»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { PaginaDeCompras } from "../../departamentos/compras/pagina-de-compras.tsx";
import { ProveedoresDeCompras } from "../../departamentos/compras/pestanas/proveedores.tsx";

/** La pantalla de Proveedores. */
function Proveedores() {
	return (
		<PaginaDeCompras activa="proveedores">
			<ProveedoresDeCompras />
		</PaginaDeCompras>
	);
}

export const Route = createFileRoute("/compras/proveedores")({ component: Proveedores });
