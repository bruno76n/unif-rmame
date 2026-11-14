/**
 * Personas de Personal: la ruta solo arma la pantalla; su pestaña lee `personal.personas` con el área y «Ver tarifas»
 * de la dirección.
 * Fase 19 · docs/interfaz/fabrica/personal.md («Personas»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDePersonal } from "../../departamentos/personal/direccion.ts";
import { PaginaDePersonal } from "../../departamentos/personal/pagina.tsx";
import { PersonasDePersonal } from "../../departamentos/personal/pestanas/personas.tsx";

/** La pantalla de Personas. */
function Personas() {
	return (
		<PaginaDePersonal activa="personas">
			<PersonasDePersonal />
		</PaginaDePersonal>
	);
}

export const Route = createFileRoute("/personal/personas")({
	validateSearch: busquedaDePersonal,
	component: Personas,
});
