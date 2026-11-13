/**
 * La pestaña Pantalla de acceso de Administración del sistema.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Pantalla de acceso»)
 *
 * La ruta solo arma la pantalla: sus filtros, el cajón abierto y el renglón resaltado vienen de la dirección.
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeAdmin } from "../../departamentos/admin/direccion.ts";
import { PaginaDeAdmin } from "../../departamentos/admin/pagina.tsx";
import { PestanaPantallaDeAcceso } from "../../departamentos/admin/pestanas/pantalla-de-acceso.tsx";

export const Route = createFileRoute("/admin/pantalla-de-acceso")({
	validateSearch: busquedaDeAdmin,
	component: () => (
		<PaginaDeAdmin activa="pantalla-de-acceso">
			<PestanaPantallaDeAcceso />
		</PaginaDeAdmin>
	),
});
