/**
 * Pendientes de Dirección (`/direccion`): la ruta solo arma la pantalla y valida el filtro del panel de la dirección
 * (`?grupo=autorizaciones`); su pestaña lee `direccion.pendientes`.
 * Fase 19 · docs/interfaz/fabrica/direccion.md («Pendientes»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDePendientes } from "../../departamentos/direccion/direccion.ts";
import { PaginaDeDireccion } from "../../departamentos/direccion/pagina-de-direccion.tsx";
import { PestanaPendientes } from "../../departamentos/direccion/pestanas/pendientes.tsx";

/** La ruta de Pendientes. */
function Pendientes() {
	return (
		<PaginaDeDireccion activa="pendientes">
			<PestanaPendientes />
		</PaginaDeDireccion>
	);
}

export const Route = createFileRoute("/direccion/")({ validateSearch: busquedaDePendientes, component: Pendientes });
