/**
 * Inventario en aduana: su pestaña lee `inventario.inventario_en_aduana` por páginas.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Inventario en aduana»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeAduana } from "../../departamentos/aduana/direccion.ts";
import { PaginaDeAduana } from "../../departamentos/aduana/pagina.tsx";
import { InventarioDeAduana } from "../../departamentos/aduana/pestanas/inventario.tsx";

/** La pantalla de Inventario en aduana. */
function Pantalla() {
	return (
		<PaginaDeAduana activa="inventario">
			<InventarioDeAduana />
		</PaginaDeAduana>
	);
}

export const Route = createFileRoute("/aduana/inventario")({
	validateSearch: busquedaDeAduana,
	component: Pantalla,
});
