/**
 * Asistencia de Personal, la primera pestaña: lee `personal.asistencia` con la semana de la dirección y la entrega a su
 * pestaña.
 * Fase 19 · docs/interfaz/fabrica/personal.md («Asistencia»)
 *
 * Mientras llega otra semana, la pestaña sigue mostrando la anterior: el selector no pierde su valor.
 */

import { createFileRoute } from "@tanstack/react-router";
import { asistenciaDePersonal } from "@uniformame/compartido/contratos/personal/asistencia";
import { useConsulta } from "../../comun/api.tsx";
import { SegunConsulta } from "../../comun/segun-consulta.tsx";
import { busquedaDePersonal, useDireccionDePersonal } from "../../departamentos/personal/direccion.ts";
import { PaginaDePersonal } from "../../departamentos/personal/pagina.tsx";
import { AsistenciaDePersonal } from "../../departamentos/personal/pestanas/asistencia.tsx";

/** La pantalla de Asistencia. */
function Asistencia() {
	const { busqueda } = useDireccionDePersonal();
	const consulta = useConsulta(
		asistenciaDePersonal,
		busqueda.semana === undefined ? {} : { asistencia_semana_id: busqueda.semana },
		true,
		true,
	);
	return (
		<PaginaDePersonal activa="pendientes">
			<SegunConsulta consulta={consulta} renglones={8}>
				{(datos) => <AsistenciaDePersonal datos={datos} />}
			</SegunConsulta>
		</PaginaDePersonal>
	);
}

export const Route = createFileRoute("/personal/")({
	validateSearch: busquedaDePersonal,
	component: Asistencia,
});
