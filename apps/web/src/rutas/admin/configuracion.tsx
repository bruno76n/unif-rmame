/**
 * La pestaña Configuración de Administración del sistema.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Configuración»)
 *
 * La ruta solo arma la pantalla: sus filtros, el cajón abierto y el renglón resaltado vienen de la dirección.
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeAdmin } from "../../departamentos/admin/direccion.ts";
import { PaginaDeAdmin } from "../../departamentos/admin/pagina.tsx";
import { PestanaConfiguracion } from "../../departamentos/admin/pestanas/configuracion.tsx";

export const Route = createFileRoute("/admin/configuracion")({
	validateSearch: busquedaDeAdmin,
	component: () => (
		<PaginaDeAdmin activa="configuracion">
			<PestanaConfiguracion />
		</PaginaDeAdmin>
	),
});
