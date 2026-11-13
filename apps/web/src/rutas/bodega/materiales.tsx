/**
 * Materiales de Bodega: lee `inventario.materiales` y la entrega a su pestaña.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Materiales»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { materialesDeBodega } from "@uniformame/compartido/contratos/inventario/bodega";
import { useConsulta } from "../../comun/api.tsx";
import { SegunConsulta } from "../../comun/segun-consulta.tsx";
import { busquedaDeBodega } from "../../departamentos/bodega/direccion.ts";
import { PaginaDeBodega } from "../../departamentos/bodega/pagina.tsx";
import { MaterialesDeBodega } from "../../departamentos/bodega/pestanas/materiales.tsx";

/** La pantalla de Materiales. */
function Materiales() {
	const consulta = useConsulta(materialesDeBodega, {});
	return (
		<PaginaDeBodega activa="materiales">
			<SegunConsulta consulta={consulta}>{(datos) => <MaterialesDeBodega datos={datos} />}</SegunConsulta>
		</PaginaDeBodega>
	);
}

export const Route = createFileRoute("/bodega/materiales")({
	validateSearch: busquedaDeBodega,
	component: Materiales,
});
