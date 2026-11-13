/**
 * Máquinas de Mantenimiento: lee `mantenimiento.maquinas` y la entrega a su pestaña.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Máquinas»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { maquinasDeMantenimiento } from "@uniformame/compartido/contratos/mantenimiento/consultas-pestanas";
import { useConsulta } from "../../comun/api.tsx";
import { SegunConsulta } from "../../comun/segun-consulta.tsx";
import { busquedaDeMantenimiento } from "../../departamentos/mantenimiento/direccion.ts";
import { PaginaDeMantenimiento } from "../../departamentos/mantenimiento/pagina.tsx";
import { MaquinasDeMantenimiento } from "../../departamentos/mantenimiento/pestanas/maquinas.tsx";

/** La pantalla de Máquinas. */
function Maquinas() {
	const consulta = useConsulta(maquinasDeMantenimiento, {});
	return (
		<PaginaDeMantenimiento activa="maquinas">
			<SegunConsulta consulta={consulta}>{(datos) => <MaquinasDeMantenimiento datos={datos} />}</SegunConsulta>
		</PaginaDeMantenimiento>
	);
}

export const Route = createFileRoute("/mantenimiento/maquinas")({
	validateSearch: busquedaDeMantenimiento,
	component: Maquinas,
});
