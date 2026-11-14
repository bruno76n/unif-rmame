/**
 * PIN del taller de Personal: la ruta solo arma la pantalla; su pestaña lee `personal.pines`.
 * Fase 19 · docs/interfaz/fabrica/personal.md («PIN del taller»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDePersonal } from "../../departamentos/personal/direccion.ts";
import { PaginaDePersonal } from "../../departamentos/personal/pagina.tsx";
import { PinDePersonal } from "../../departamentos/personal/pestanas/pin.tsx";

/** La pantalla de PIN del taller. */
function Pin() {
	return (
		<PaginaDePersonal activa="pin">
			<PinDePersonal />
		</PaginaDePersonal>
	);
}

export const Route = createFileRoute("/personal/pin")({
	validateSearch: busquedaDePersonal,
	component: Pin,
});
