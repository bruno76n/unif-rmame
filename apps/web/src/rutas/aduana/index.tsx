/**
 * El Andén de Aduana, su primera pestaña: la ruta solo arma la pantalla; su pestaña lee `inventario.anden`.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Andén»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeAduana } from "../../departamentos/aduana/direccion.ts";
import { PaginaDeAduana } from "../../departamentos/aduana/pagina.tsx";
import { AndenDeAduana } from "../../departamentos/aduana/pestanas/anden.tsx";

/** La pantalla de Andén. */
function Pantalla() {
	return (
		<PaginaDeAduana activa="pendientes">
			<AndenDeAduana />
		</PaginaDeAduana>
	);
}

export const Route = createFileRoute("/aduana/")({
	validateSearch: busquedaDeAduana,
	component: Pantalla,
});
