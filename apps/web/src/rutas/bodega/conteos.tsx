/**
 * Conteos y ajustes de Bodega: lee `inventario.conteos_y_ajustes` y la entrega a su pestaña, que pide lo demás por páginas.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Conteos y ajustes»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { conteosYAjustesDeBodega } from "@uniformame/compartido/contratos/inventario/bodega";
import { useConsulta } from "../../comun/api.tsx";
import { SegunConsulta } from "../../comun/segun-consulta.tsx";
import { busquedaDeBodega } from "../../departamentos/bodega/direccion.ts";
import { PaginaDeBodega } from "../../departamentos/bodega/pagina.tsx";
import { ConteosDeBodega } from "../../departamentos/bodega/pestanas/conteos.tsx";

/** La pantalla de Conteos y ajustes. */
function ConteosYajustes() {
	const consulta = useConsulta(conteosYAjustesDeBodega, {});
	return (
		<PaginaDeBodega activa="conteos">
			<SegunConsulta consulta={consulta}>{(datos) => <ConteosDeBodega datos={datos} />}</SegunConsulta>
		</PaginaDeBodega>
	);
}

export const Route = createFileRoute("/bodega/conteos")({
	validateSearch: busquedaDeBodega,
	component: ConteosYajustes,
});
