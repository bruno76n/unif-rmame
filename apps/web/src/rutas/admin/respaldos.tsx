/**
 * La pestaña Respaldos de Administración del sistema.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Respaldos»)
 *
 * La ruta solo arma la pantalla: sus filtros, el cajón abierto y el renglón resaltado vienen de la dirección.
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeAdmin } from "../../departamentos/admin/direccion.ts";
import { PaginaDeAdmin } from "../../departamentos/admin/pagina.tsx";
import { PestanaRespaldos } from "../../departamentos/admin/pestanas/respaldos.tsx";

export const Route = createFileRoute("/admin/respaldos")({
	validateSearch: busquedaDeAdmin,
	component: () => (
		<PaginaDeAdmin activa="respaldos">
			<PestanaRespaldos />
		</PaginaDeAdmin>
	),
});
