/**
 * Tarifas de Personal: la ruta solo arma la pantalla; su pestaña lee `personal.tarifas` (solo con «ven sueldos y
 * tarifas»).
 * Fase 19 · docs/interfaz/fabrica/personal.md («Tarifas»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDePersonal } from "../../departamentos/personal/direccion.ts";
import { PaginaDePersonal } from "../../departamentos/personal/pagina.tsx";
import { TarifasDePersonal } from "../../departamentos/personal/pestanas/tarifas.tsx";

/** La pantalla de Tarifas. */
function Tarifas() {
	return (
		<PaginaDePersonal activa="tarifas">
			<TarifasDePersonal />
		</PaginaDePersonal>
	);
}

export const Route = createFileRoute("/personal/tarifas")({
	validateSearch: busquedaDePersonal,
	component: Tarifas,
});
