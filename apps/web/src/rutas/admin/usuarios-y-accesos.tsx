/**
 * La pestaña Usuarios y accesos de Administración del sistema.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Usuarios y accesos»)
 *
 * La ruta solo arma la pantalla: sus filtros, el cajón abierto y el renglón resaltado vienen de la dirección.
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeAdmin } from "../../departamentos/admin/direccion.ts";
import { PaginaDeAdmin } from "../../departamentos/admin/pagina.tsx";
import { PestanaUsuarios } from "../../departamentos/admin/pestanas/usuarios.tsx";

export const Route = createFileRoute("/admin/usuarios-y-accesos")({
	validateSearch: busquedaDeAdmin,
	component: () => (
		<PaginaDeAdmin activa="usuarios-y-accesos">
			<PestanaUsuarios />
		</PaginaDeAdmin>
	),
});
