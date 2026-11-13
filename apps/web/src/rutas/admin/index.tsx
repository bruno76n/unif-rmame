/**
 * Pendientes de Administración del sistema: la primera pestaña.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Pendientes»)
 *
 * La ruta solo arma la pantalla: sus filtros, el cajón abierto y el renglón resaltado vienen de la dirección.
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeAdmin } from "../../departamentos/admin/direccion.ts";
import { PaginaDeAdmin } from "../../departamentos/admin/pagina.tsx";
import { PestanaPendientes } from "../../departamentos/admin/pestanas/pendientes.tsx";

export const Route = createFileRoute("/admin/")({
	validateSearch: busquedaDeAdmin,
	component: () => (
		<PaginaDeAdmin activa="pendientes">
			<PestanaPendientes />
		</PaginaDeAdmin>
	),
});
