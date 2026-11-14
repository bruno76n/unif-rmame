/**
 * Empaque en línea: la ruta solo arma la pantalla; su pestaña lee `linea.pedidos` con sus dos etapas (con el recorte
 * de Aduana: sin precios ni totales).
 * Tienda en línea enlaza aquí «Ver en aduana».
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Empaque en línea»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeAduana } from "../../departamentos/aduana/direccion.ts";
import { PaginaDeAduana } from "../../departamentos/aduana/pagina.tsx";
import { EmpaqueDeAduana } from "../../departamentos/aduana/pestanas/empaque.tsx";

/** La pantalla de Empaque en línea. */
function Pantalla() {
	return (
		<PaginaDeAduana activa="empaque">
			<EmpaqueDeAduana />
		</PaginaDeAduana>
	);
}

export const Route = createFileRoute("/aduana/empaque")({
	validateSearch: busquedaDeAduana,
	component: Pantalla,
});
