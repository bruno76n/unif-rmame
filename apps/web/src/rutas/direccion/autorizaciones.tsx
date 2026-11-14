/**
 * Autorizaciones de Dirección (`/direccion/autorizaciones`): la ruta solo arma la pantalla y valida el filtro de la
 * dirección (`?tipo=nota_credito`); su pestaña lee `direccion.autorizaciones` y decide cada autorización.
 * Fase 19 · docs/interfaz/fabrica/direccion.md («Autorizaciones»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeAutorizaciones } from "../../departamentos/direccion/direccion.ts";
import { PaginaDeDireccion } from "../../departamentos/direccion/pagina-de-direccion.tsx";
import { PestanaAutorizaciones } from "../../departamentos/direccion/pestanas/autorizaciones.tsx";

/** La ruta de Autorizaciones. */
function Autorizaciones() {
	return (
		<PaginaDeDireccion activa="autorizaciones">
			<PestanaAutorizaciones />
		</PaginaDeDireccion>
	);
}

export const Route = createFileRoute("/direccion/autorizaciones")({
	validateSearch: busquedaDeAutorizaciones,
	component: Autorizaciones,
});
