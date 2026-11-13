/**
 * El Andén de Aduana, su primera pestaña: lee `inventario.anden` y lo entrega a su pestaña.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Andén»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { andenDeAduana } from "@uniformame/compartido/contratos/inventario/aduana";
import { useConsulta } from "../../comun/api.tsx";
import { SegunConsulta } from "../../comun/segun-consulta.tsx";
import { busquedaDeAduana } from "../../departamentos/aduana/direccion.ts";
import { PaginaDeAduana } from "../../departamentos/aduana/pagina.tsx";
import { AndenDeAduana } from "../../departamentos/aduana/pestanas/anden.tsx";

/** La pantalla de Andén. */
function Pantalla() {
	const consulta = useConsulta(andenDeAduana, {});
	return (
		<PaginaDeAduana activa="pendientes">
			<SegunConsulta consulta={consulta}>{(datos) => <AndenDeAduana datos={datos} />}</SegunConsulta>
		</PaginaDeAduana>
	);
}

export const Route = createFileRoute("/aduana/")({
	validateSearch: busquedaDeAduana,
	component: Pantalla,
});
