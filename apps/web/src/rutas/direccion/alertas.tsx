/**
 * Alertas cruzadas de Dirección (`/direccion/alertas`): la ruta solo arma la pantalla; su pestaña lee `direccion.alertas`.
 * Fase 19 · docs/interfaz/fabrica/direccion.md («Alertas cruzadas»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { PaginaDeDireccion } from "../../departamentos/direccion/pagina-de-direccion.tsx";
import { PestanaAlertas } from "../../departamentos/direccion/pestanas/alertas.tsx";

/** La ruta de Alertas cruzadas. */
function Alertas() {
	return (
		<PaginaDeDireccion activa="alertas">
			<PestanaAlertas />
		</PaginaDeDireccion>
	);
}

export const Route = createFileRoute("/direccion/alertas")({ component: Alertas });
