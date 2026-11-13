/**
 * El historial de Aduana: su pestaña lee `inventario.aduana_historial` por páginas.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Historial»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeAduana } from "../../departamentos/aduana/direccion.ts";
import { PaginaDeAduana } from "../../departamentos/aduana/pagina.tsx";
import { HistorialDeAduana } from "../../departamentos/aduana/pestanas/historial.tsx";

/** La pantalla de Historial. */
function Pantalla() {
	return (
		<PaginaDeAduana activa="historial">
			<HistorialDeAduana />
		</PaginaDeAduana>
	);
}

export const Route = createFileRoute("/aduana/historial")({
	validateSearch: busquedaDeAduana,
	component: Pantalla,
});
