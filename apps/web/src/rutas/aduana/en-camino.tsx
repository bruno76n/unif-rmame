/**
 * En camino a aduana: su pestaña lee `inventario.en_camino_aduana` por páginas.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («En camino a aduana»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeAduana } from "../../departamentos/aduana/direccion.ts";
import { PaginaDeAduana } from "../../departamentos/aduana/pagina.tsx";
import { EnCaminoDeAduana } from "../../departamentos/aduana/pestanas/en-camino.tsx";

/** La pantalla de En camino a aduana. */
function Pantalla() {
	return (
		<PaginaDeAduana activa="en-camino">
			<EnCaminoDeAduana />
		</PaginaDeAduana>
	);
}

export const Route = createFileRoute("/aduana/en-camino")({
	validateSearch: busquedaDeAduana,
	component: Pantalla,
});
