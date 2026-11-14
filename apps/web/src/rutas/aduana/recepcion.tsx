/**
 * Recepción de Aduana: la ruta solo arma la pantalla; su pestaña lee `inventario.aduana_recepcion` (con todas las
 * órdenes si la dirección lo dice).
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Recepción»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeAduana } from "../../departamentos/aduana/direccion.ts";
import { PaginaDeAduana } from "../../departamentos/aduana/pagina.tsx";
import { RecepcionDeAduana } from "../../departamentos/aduana/pestanas/recepcion.tsx";

/** La pantalla de Recepción. */
function Pantalla() {
	return (
		<PaginaDeAduana activa="recepcion">
			<RecepcionDeAduana />
		</PaginaDeAduana>
	);
}

export const Route = createFileRoute("/aduana/recepcion")({
	validateSearch: busquedaDeAduana,
	component: Pantalla,
});
