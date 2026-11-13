/**
 * Despacho de Aduana: lee `inventario.aduana_despacho` y lo entrega a su pestaña.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Despacho»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { despachoDeAduana } from "@uniformame/compartido/contratos/inventario/aduana";
import { useConsulta } from "../../comun/api.tsx";
import { SegunConsulta } from "../../comun/segun-consulta.tsx";
import { busquedaDeAduana } from "../../departamentos/aduana/direccion.ts";
import { PaginaDeAduana } from "../../departamentos/aduana/pagina.tsx";
import { DespachoDeAduana } from "../../departamentos/aduana/pestanas/despacho.tsx";

/** La pantalla de Despacho. */
function Pantalla() {
	const consulta = useConsulta(despachoDeAduana, {});
	return (
		<PaginaDeAduana activa="despacho">
			<SegunConsulta consulta={consulta}>{(datos) => <DespachoDeAduana datos={datos} />}</SegunConsulta>
		</PaginaDeAduana>
	);
}

export const Route = createFileRoute("/aduana/despacho")({
	validateSearch: busquedaDeAduana,
	component: Pantalla,
});
