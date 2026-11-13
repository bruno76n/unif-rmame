/**
 * Proveedores de Compras: lee la búsqueda y «Dados de baja» de la dirección, pide `compras.proveedores` y la entrega a
 * su pestaña.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Proveedores»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { proveedoresDeCompras } from "@uniformame/compartido/contratos/compras/consultas-pestanas";
import { useConsulta } from "../../comun/api.tsx";
import { SegunConsulta } from "../../comun/segun-consulta.tsx";
import { useDireccionDeCompras } from "../../departamentos/compras/direccion.ts";
import { PaginaDeCompras } from "../../departamentos/compras/pagina-de-compras.tsx";
import { ProveedoresDeCompras } from "../../departamentos/compras/pestanas/proveedores.tsx";

/** La pantalla de Proveedores. */
function Proveedores() {
	const { busqueda } = useDireccionDeCompras();
	const consulta = useConsulta(proveedoresDeCompras, { buscar: busqueda.buscar, incluir_bajas: busqueda.bajas });
	return (
		<PaginaDeCompras activa="proveedores">
			<SegunConsulta consulta={consulta}>
				{({ proveedores }) => <ProveedoresDeCompras proveedores={proveedores} />}
			</SegunConsulta>
		</PaginaDeCompras>
	);
}

export const Route = createFileRoute("/compras/proveedores")({ component: Proveedores });
