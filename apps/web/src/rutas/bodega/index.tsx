/**
 * Pendientes de Bodega, la primera pestaña: lee `inventario.bodega_pendientes` con el filtro de la dirección y la entrega a su pestaña.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Pendientes»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { pendientesDeBodega } from "@uniformame/compartido/contratos/inventario/bodega";
import { useConsulta } from "../../comun/api.tsx";
import { SegunConsulta } from "../../comun/segun-consulta.tsx";
import { busquedaDeBodega, useDireccionDeBodega } from "../../departamentos/bodega/direccion.ts";
import { PaginaDeBodega } from "../../departamentos/bodega/pagina.tsx";
import { grupoDePendientes, PendientesDeBodega } from "../../departamentos/bodega/pestanas/pendientes.tsx";

/** La pantalla de Pendientes. */
function Pendientes() {
	const { busqueda } = useDireccionDeBodega();
	const consulta = useConsulta(
		pendientesDeBodega,
		busqueda.grupo === undefined ? {} : { grupo: grupoDePendientes(busqueda.grupo) },
	);
	return (
		<PaginaDeBodega activa="pendientes">
			<SegunConsulta consulta={consulta}>{(datos) => <PendientesDeBodega datos={datos} />}</SegunConsulta>
		</PaginaDeBodega>
	);
}

export const Route = createFileRoute("/bodega/")({
	validateSearch: busquedaDeBodega,
	component: Pendientes,
});
