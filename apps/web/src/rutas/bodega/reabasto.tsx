/**
 * Reabasto de Bodega: lee `inventario.reabasto` y la entrega a su pestaña.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Reabasto»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { reabastoDeBodega } from "@uniformame/compartido/contratos/inventario/bodega";
import { useConsulta } from "../../comun/api.tsx";
import { SegunConsulta } from "../../comun/segun-consulta.tsx";
import { busquedaDeBodega } from "../../departamentos/bodega/direccion.ts";
import { PaginaDeBodega } from "../../departamentos/bodega/pagina.tsx";
import { ReabastoDeBodega } from "../../departamentos/bodega/pestanas/reabasto.tsx";

/** La pantalla de Reabasto. */
function Reabasto() {
	const consulta = useConsulta(reabastoDeBodega, {});
	return (
		<PaginaDeBodega activa="reabasto">
			<SegunConsulta consulta={consulta}>{(datos) => <ReabastoDeBodega datos={datos} />}</SegunConsulta>
		</PaginaDeBodega>
	);
}

export const Route = createFileRoute("/bodega/reabasto")({
	validateSearch: busquedaDeBodega,
	component: Reabasto,
});
