/**
 * Materiales de Compras: lee la búsqueda y «Dados de baja» de la dirección, pide `compras.materiales` y la entrega a su
 * pestaña.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Materiales»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { materialesDeCompras } from "@uniformame/compartido/contratos/compras/consultas-pestanas";
import { useConsulta } from "../../comun/api.tsx";
import { SegunConsulta } from "../../comun/segun-consulta.tsx";
import { useDireccionDeCompras } from "../../departamentos/compras/direccion.ts";
import { PaginaDeCompras } from "../../departamentos/compras/pagina-de-compras.tsx";
import { MaterialesDeCompras } from "../../departamentos/compras/pestanas/materiales.tsx";

/** La pantalla de Materiales. */
function Materiales() {
	const { busqueda } = useDireccionDeCompras();
	const consulta = useConsulta(materialesDeCompras, { buscar: busqueda.buscar, incluir_bajas: busqueda.bajas });
	return (
		<PaginaDeCompras activa="materiales">
			<SegunConsulta consulta={consulta}>{(datos) => <MaterialesDeCompras datos={datos} />}</SegunConsulta>
		</PaginaDeCompras>
	);
}

export const Route = createFileRoute("/compras/materiales")({ component: Materiales });
