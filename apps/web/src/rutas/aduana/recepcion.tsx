/**
 * Recepción de Aduana: lee `inventario.aduana_recepcion` (con todas las órdenes si la dirección lo dice) y la entrega a su pestaña.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Recepción»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { recepcionDeAduana } from "@uniformame/compartido/contratos/inventario/aduana";
import { useConsulta } from "../../comun/api.tsx";
import { SegunConsulta } from "../../comun/segun-consulta.tsx";
import { busquedaDeAduana, useDireccionDeAduana } from "../../departamentos/aduana/direccion.ts";
import { PaginaDeAduana } from "../../departamentos/aduana/pagina.tsx";
import { RecepcionDeAduana } from "../../departamentos/aduana/pestanas/recepcion.tsx";

/** La pantalla de Recepción. */
function Pantalla() {
	const { busqueda } = useDireccionDeAduana();
	const consulta = useConsulta(recepcionDeAduana, busqueda.todas === undefined ? {} : { todas_las_ordenes: true });
	return (
		<PaginaDeAduana activa="recepcion">
			<SegunConsulta consulta={consulta}>{(datos) => <RecepcionDeAduana datos={datos} />}</SegunConsulta>
		</PaginaDeAduana>
	);
}

export const Route = createFileRoute("/aduana/recepcion")({
	validateSearch: busquedaDeAduana,
	component: Pantalla,
});
