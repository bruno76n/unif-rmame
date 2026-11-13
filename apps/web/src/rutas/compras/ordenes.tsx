/**
 * Órdenes de compra de Compras: lee la búsqueda de la dirección, pide `compras.ordenes` y la entrega a su pestaña.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Órdenes de compra»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { ordenesDeCompra } from "@uniformame/compartido/contratos/compras/consultas-pestanas";
import { useConsulta } from "../../comun/api.tsx";
import { SegunConsulta } from "../../comun/segun-consulta.tsx";
import { useDireccionDeCompras } from "../../departamentos/compras/direccion.ts";
import { PaginaDeCompras } from "../../departamentos/compras/pagina-de-compras.tsx";
import { OrdenesDeCompras } from "../../departamentos/compras/pestanas/ordenes.tsx";

/** La pantalla de Órdenes de compra. */
function Ordenes() {
	const { busqueda } = useDireccionDeCompras();
	const consulta = useConsulta(ordenesDeCompra, { buscar: busqueda.buscar });
	return (
		<PaginaDeCompras activa="ordenes">
			<SegunConsulta consulta={consulta}>{({ ordenes }) => <OrdenesDeCompras ordenes={ordenes} />}</SegunConsulta>
		</PaginaDeCompras>
	);
}

export const Route = createFileRoute("/compras/ordenes")({ component: Ordenes });
