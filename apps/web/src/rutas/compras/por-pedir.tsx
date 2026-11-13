/**
 * Por pedir de Compras: lee la búsqueda, el proveedor y el horizonte de la dirección, pide `compras.por_pedir` y la
 * entrega a su pestaña. Lo escogido vive solo en esta pestaña; «Levantar orden» lo lleva.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Por pedir»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { porPedir } from "@uniformame/compartido/contratos/compras/consultas-pestanas";
import { useState } from "react";
import { useConsulta } from "../../comun/api.tsx";
import { SegunConsulta } from "../../comun/segun-consulta.tsx";
import { useDireccionDeCompras } from "../../departamentos/compras/direccion.ts";
import { PaginaDeCompras } from "../../departamentos/compras/pagina-de-compras.tsx";
import { PorPedirDeCompras } from "../../departamentos/compras/pestanas/por-pedir.tsx";

/** La pantalla de Por pedir. */
function PorPedir() {
	const { busqueda } = useDireccionDeCompras();
	const [escogidos, setEscogidos] = useState<string[]>([]);
	const consulta = useConsulta(porPedir, {
		buscar: busqueda.buscar,
		proveedor_id: busqueda.proveedor,
		horizonte: busqueda.horizonte,
	});
	return (
		<PaginaDeCompras activa="por-pedir" escogidos={escogidos}>
			<SegunConsulta consulta={consulta}>
				{(datos) => <PorPedirDeCompras datos={datos} escogidos={escogidos} alEscoger={setEscogidos} />}
			</SegunConsulta>
		</PaginaDeCompras>
	);
}

export const Route = createFileRoute("/compras/por-pedir")({ component: PorPedir });
