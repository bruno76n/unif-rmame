/**
 * Por pedir de Compras: la ruta solo arma la pantalla; su pestaña lee `compras.por_pedir` con la búsqueda, el proveedor
 * y el horizonte de la dirección. Lo escogido vive solo en esta pantalla: la pestaña lo marca y «Levantar orden» de la
 * página lo lleva.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Por pedir»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PaginaDeCompras } from "../../departamentos/compras/pagina-de-compras.tsx";
import { PorPedirDeCompras } from "../../departamentos/compras/pestanas/por-pedir.tsx";

/** La pantalla de Por pedir. */
function PorPedir() {
	const [escogidos, setEscogidos] = useState<string[]>([]);
	return (
		<PaginaDeCompras activa="por-pedir" escogidos={escogidos}>
			<PorPedirDeCompras escogidos={escogidos} alEscoger={setEscogidos} />
		</PaginaDeCompras>
	);
}

export const Route = createFileRoute("/compras/por-pedir")({ component: PorPedir });
