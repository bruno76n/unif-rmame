/**
 * Despacho de Aduana: la ruta solo arma la pantalla; su pestaña lee `inventario.aduana_despacho`.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Despacho»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeAduana } from "../../departamentos/aduana/direccion.ts";
import { PaginaDeAduana } from "../../departamentos/aduana/pagina.tsx";
import { DespachoDeAduana } from "../../departamentos/aduana/pestanas/despacho.tsx";

/** La pantalla de Despacho. */
function Pantalla() {
	return (
		<PaginaDeAduana activa="despacho">
			<DespachoDeAduana />
		</PaginaDeAduana>
	);
}

export const Route = createFileRoute("/aduana/despacho")({
	validateSearch: busquedaDeAduana,
	component: Pantalla,
});
