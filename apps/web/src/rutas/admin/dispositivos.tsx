/**
 * La pestaña Dispositivos de Administración del sistema (Dirección la enlaza con `/admin/dispositivos`).
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Dispositivos»)
 *
 * La ruta solo arma la pantalla: sus filtros, el cajón abierto y el renglón resaltado vienen de la dirección.
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeAdmin } from "../../departamentos/admin/direccion.ts";
import { PaginaDeAdmin } from "../../departamentos/admin/pagina.tsx";
import { PestanaDispositivos } from "../../departamentos/admin/pestanas/dispositivos.tsx";

export const Route = createFileRoute("/admin/dispositivos")({
	validateSearch: busquedaDeAdmin,
	component: () => (
		<PaginaDeAdmin activa="dispositivos">
			<PestanaDispositivos />
		</PaginaDeAdmin>
	),
});
