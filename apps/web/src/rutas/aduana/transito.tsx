/**
 * En tránsito: su pestaña lee `inventario.en_transito` por páginas.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («En tránsito»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeAduana } from "../../departamentos/aduana/direccion.ts";
import { PaginaDeAduana } from "../../departamentos/aduana/pagina.tsx";
import { TransitoDeAduana } from "../../departamentos/aduana/pestanas/transito.tsx";

/** La pantalla de En tránsito. */
function Pantalla() {
	return (
		<PaginaDeAduana activa="transito">
			<TransitoDeAduana />
		</PaginaDeAduana>
	);
}

export const Route = createFileRoute("/aduana/transito")({
	validateSearch: busquedaDeAduana,
	component: Pantalla,
});
