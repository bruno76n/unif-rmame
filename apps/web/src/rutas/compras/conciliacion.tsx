/**
 * Conciliación de facturas de Compras: la ruta solo arma la pantalla; su pestaña lee `compras.conciliacion_facturas`.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Conciliación de facturas»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { PaginaDeCompras } from "../../departamentos/compras/pagina-de-compras.tsx";
import { ConciliacionDeCompras } from "../../departamentos/compras/pestanas/conciliacion.tsx";

/** La pantalla de Conciliación de facturas. */
function Conciliacion() {
	return (
		<PaginaDeCompras activa="conciliacion">
			<ConciliacionDeCompras />
		</PaginaDeCompras>
	);
}

export const Route = createFileRoute("/compras/conciliacion")({ component: Conciliacion });
