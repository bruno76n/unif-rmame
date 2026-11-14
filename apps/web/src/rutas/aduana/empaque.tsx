/**
 * Empaque en línea: lee `linea.pedidos` con sus dos etapas (con el recorte de Aduana: sin precios ni totales) y lo
 * entrega a su pestaña.
 * Tienda en línea enlaza aquí «Ver en aduana».
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Empaque en línea»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { pedidosLinea } from "@uniformame/compartido/contratos/linea/consultas";
import { useConsulta } from "../../comun/api.tsx";
import { SegunConsulta } from "../../comun/segun-consulta.tsx";
import { busquedaDeAduana } from "../../departamentos/aduana/direccion.ts";
import { PaginaDeAduana } from "../../departamentos/aduana/pagina.tsx";
import { EmpaqueDeAduana } from "../../departamentos/aduana/pestanas/empaque.tsx";

/** Las dos etapas que ve Aduana, en su orden: lo que espera prendas y lo listo para empacar. */
const etapasDeEmpaque = "esperando_prendas,listo_para_empacar";

/** La pantalla de Empaque en línea. */
function Pantalla() {
	const consulta = useConsulta(pedidosLinea, { estados: etapasDeEmpaque });
	return (
		<PaginaDeAduana activa="empaque">
			<SegunConsulta consulta={consulta}>{(datos) => <EmpaqueDeAduana datos={datos} />}</SegunConsulta>
		</PaginaDeAduana>
	);
}

export const Route = createFileRoute("/aduana/empaque")({
	validateSearch: busquedaDeAduana,
	component: Pantalla,
});
