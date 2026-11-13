/**
 * Personas de Personal: lee `personal.personas` con el área y «Ver tarifas» de la dirección y la entrega a su pestaña.
 * Fase 19 · docs/interfaz/fabrica/personal.md («Personas»)
 *
 * Mientras llega la lista de otra área, la pestaña sigue mostrando la anterior: el selector no pierde su valor.
 */

import { createFileRoute } from "@tanstack/react-router";
import { personasDeLaLista } from "@uniformame/compartido/contratos/personal/personas";
import { useConsulta } from "../../comun/api.tsx";
import { SegunConsulta } from "../../comun/segun-consulta.tsx";
import { busquedaDePersonal, useDireccionDePersonal } from "../../departamentos/personal/direccion.ts";
import { PaginaDePersonal } from "../../departamentos/personal/pagina.tsx";
import { PersonasDePersonal, parametrosDePersonas } from "../../departamentos/personal/pestanas/personas.tsx";

/** La pantalla de Personas. */
function Personas() {
	const { busqueda } = useDireccionDePersonal();
	const consulta = useConsulta(
		personasDeLaLista,
		parametrosDePersonas(busqueda.area, busqueda.ver === "si"),
		true,
		true,
	);
	return (
		<PaginaDePersonal activa="personas">
			<SegunConsulta consulta={consulta} renglones={8}>
				{(datos) => <PersonasDePersonal datos={datos} />}
			</SegunConsulta>
		</PaginaDePersonal>
	);
}

export const Route = createFileRoute("/personal/personas")({
	validateSearch: busquedaDePersonal,
	component: Personas,
});
