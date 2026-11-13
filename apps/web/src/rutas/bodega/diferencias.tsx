/**
 * Diferencias de Bodega: lee `inventario.diferencias` y la entrega a su pestaña, que pide las resueltas por páginas.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Diferencias»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { diferenciasDeBodega } from "@uniformame/compartido/contratos/inventario/bodega";
import { useConsulta } from "../../comun/api.tsx";
import { SegunConsulta } from "../../comun/segun-consulta.tsx";
import { busquedaDeBodega } from "../../departamentos/bodega/direccion.ts";
import { PaginaDeBodega } from "../../departamentos/bodega/pagina.tsx";
import { DiferenciasDeBodega } from "../../departamentos/bodega/pestanas/diferencias.tsx";

/** La pantalla de Diferencias. */
function Diferencias() {
	const consulta = useConsulta(diferenciasDeBodega, {});
	return (
		<PaginaDeBodega activa="diferencias">
			<SegunConsulta consulta={consulta}>{(datos) => <DiferenciasDeBodega datos={datos} />}</SegunConsulta>
		</PaginaDeBodega>
	);
}

export const Route = createFileRoute("/bodega/diferencias")({
	validateSearch: busquedaDeBodega,
	component: Diferencias,
});
