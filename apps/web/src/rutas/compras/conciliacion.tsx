/**
 * Conciliación de facturas de Compras: pide `compras.conciliacion_facturas` y la entrega a su pestaña.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Conciliación de facturas»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { conciliacionFacturas } from "@uniformame/compartido/contratos/compras/consultas-pestanas";
import { useConsulta } from "../../comun/api.tsx";
import { SegunConsulta } from "../../comun/segun-consulta.tsx";
import { PaginaDeCompras } from "../../departamentos/compras/pagina-de-compras.tsx";
import { ConciliacionDeCompras } from "../../departamentos/compras/pestanas/conciliacion.tsx";

/** La pantalla de Conciliación de facturas. */
function Conciliacion() {
	const consulta = useConsulta(conciliacionFacturas, {});
	return (
		<PaginaDeCompras activa="conciliacion">
			<SegunConsulta consulta={consulta}>
				{({ renglones }) => <ConciliacionDeCompras renglones={renglones} />}
			</SegunConsulta>
		</PaginaDeCompras>
	);
}

export const Route = createFileRoute("/compras/conciliacion")({ component: Conciliacion });
