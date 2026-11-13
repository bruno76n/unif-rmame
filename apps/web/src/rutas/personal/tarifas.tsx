/**
 * Tarifas de Personal: lee `personal.tarifas` (solo con «ven sueldos y tarifas»; sin el permiso la consulta no responde
 * y la pantalla dice que no hay acceso) y la entrega a su pestaña.
 * Fase 19 · docs/interfaz/fabrica/personal.md («Tarifas»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { tarifasDelPersonal } from "@uniformame/compartido/contratos/personal/tarifas";
import { useConsulta } from "../../comun/api.tsx";
import { SegunConsulta } from "../../comun/segun-consulta.tsx";
import { busquedaDePersonal } from "../../departamentos/personal/direccion.ts";
import { PaginaDePersonal } from "../../departamentos/personal/pagina.tsx";
import { TarifasDePersonal } from "../../departamentos/personal/pestanas/tarifas.tsx";

/** La pantalla de Tarifas. */
function Tarifas() {
	const consulta = useConsulta(tarifasDelPersonal, {});
	return (
		<PaginaDePersonal activa="tarifas">
			<SegunConsulta consulta={consulta} renglones={8}>
				{(datos) => <TarifasDePersonal datos={datos} />}
			</SegunConsulta>
		</PaginaDePersonal>
	);
}

export const Route = createFileRoute("/personal/tarifas")({
	validateSearch: busquedaDePersonal,
	component: Tarifas,
});
