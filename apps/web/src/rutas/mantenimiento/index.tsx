/**
 * Pendientes de Mantenimiento, la primera pestaña: lee `mantenimiento.pendientes` y la entrega a su pestaña.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Pendientes»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { pendientesDeMantenimiento } from "@uniformame/compartido/contratos/mantenimiento/consultas-pestanas";
import { useConsulta } from "../../comun/api.tsx";
import { SegunConsulta } from "../../comun/segun-consulta.tsx";
import { busquedaDeMantenimiento } from "../../departamentos/mantenimiento/direccion.ts";
import { PaginaDeMantenimiento } from "../../departamentos/mantenimiento/pagina.tsx";
import { PendientesDeMantenimiento } from "../../departamentos/mantenimiento/pestanas/pendientes.tsx";

/** La pantalla de Pendientes. */
function Pendientes() {
	const consulta = useConsulta(pendientesDeMantenimiento, {});
	return (
		<PaginaDeMantenimiento activa="pendientes">
			<SegunConsulta consulta={consulta}>{(datos) => <PendientesDeMantenimiento datos={datos} />}</SegunConsulta>
		</PaginaDeMantenimiento>
	);
}

export const Route = createFileRoute("/mantenimiento/")({
	validateSearch: busquedaDeMantenimiento,
	component: Pendientes,
});
