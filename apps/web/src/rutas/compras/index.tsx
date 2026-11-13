/**
 * Pendientes de Compras, la primera pestaña: lee `compras.pendientes` y la entrega a su pestaña.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Pendientes»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { pendientesDeCompras } from "@uniformame/compartido/contratos/compras/consultas-pestanas";
import { useConsulta } from "../../comun/api.tsx";
import { SegunConsulta } from "../../comun/segun-consulta.tsx";
import { PaginaDeCompras } from "../../departamentos/compras/pagina-de-compras.tsx";
import { PendientesDeCompras } from "../../departamentos/compras/pestanas/pendientes.tsx";

/** La pantalla de Pendientes. */
function Pendientes() {
	const consulta = useConsulta(pendientesDeCompras, {});
	return (
		<PaginaDeCompras activa="pendientes">
			<SegunConsulta consulta={consulta}>{(datos) => <PendientesDeCompras datos={datos} />}</SegunConsulta>
		</PaginaDeCompras>
	);
}

export const Route = createFileRoute("/compras/")({ component: Pendientes });
