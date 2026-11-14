/**
 * Materiales de Compras: la ruta solo arma la pantalla; su pestaña lee `compras.materiales` con la búsqueda y «Dados de
 * baja» de la dirección.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Materiales»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { PaginaDeCompras } from "../../departamentos/compras/pagina-de-compras.tsx";
import { MaterialesDeCompras } from "../../departamentos/compras/pestanas/materiales.tsx";

/** La pantalla de Materiales. */
function Materiales() {
	return (
		<PaginaDeCompras activa="materiales">
			<MaterialesDeCompras />
		</PaginaDeCompras>
	);
}

export const Route = createFileRoute("/compras/materiales")({ component: Materiales });
