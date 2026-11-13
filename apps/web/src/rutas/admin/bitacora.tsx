/**
 * La pestaña Bitácora de Administración del sistema.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Bitácora»)
 *
 * La ruta solo arma la pantalla: sus filtros, el cajón abierto y el renglón resaltado vienen de la dirección.
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeAdmin } from "../../departamentos/admin/direccion.ts";
import { PaginaDeAdmin } from "../../departamentos/admin/pagina.tsx";
import { PestanaBitacora } from "../../departamentos/admin/pestanas/bitacora.tsx";

export const Route = createFileRoute("/admin/bitacora")({
	validateSearch: busquedaDeAdmin,
	component: () => (
		<PaginaDeAdmin activa="bitacora">
			<PestanaBitacora />
		</PaginaDeAdmin>
	),
});
