/**
 * Indicadores de Dirección (`/direccion/indicadores`): la ruta solo arma la pantalla y valida la comparación de la
 * dirección (`?comparar=hace_un_mes`); su pestaña lee `direccion.indicadores`.
 * Fase 19 · docs/interfaz/fabrica/direccion.md («Indicadores»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { busquedaDeIndicadores } from "../../departamentos/direccion/direccion.ts";
import { PaginaDeDireccion } from "../../departamentos/direccion/pagina-de-direccion.tsx";
import { PestanaIndicadores } from "../../departamentos/direccion/pestanas/indicadores.tsx";

/** La ruta de Indicadores. */
function Indicadores() {
	return (
		<PaginaDeDireccion activa="indicadores">
			<PestanaIndicadores />
		</PaginaDeDireccion>
	);
}

export const Route = createFileRoute("/direccion/indicadores")({
	validateSearch: busquedaDeIndicadores,
	component: Indicadores,
});
