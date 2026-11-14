/**
 * Asistencia de Personal, la primera pestaña: la ruta solo arma la pantalla; su pestaña lee `personal.asistencia` con
 * la semana de la dirección.
 * Fase 19 · docs/interfaz/fabrica/personal.md («Asistencia»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDePersonal } from "../../departamentos/personal/direccion.ts";
import { PaginaDePersonal } from "../../departamentos/personal/pagina.tsx";
import { AsistenciaDePersonal } from "../../departamentos/personal/pestanas/asistencia.tsx";

/** La pantalla de Asistencia. */
function Asistencia() {
	return (
		<PaginaDePersonal activa="pendientes">
			<AsistenciaDePersonal />
		</PaginaDePersonal>
	);
}

export const Route = createFileRoute("/personal/")({
	validateSearch: busquedaDePersonal,
	component: Asistencia,
});
