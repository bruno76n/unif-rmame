/**
 * PIN del taller de Personal: lee `personal.pines` y la entrega a su pestaña.
 * Fase 19 · docs/interfaz/fabrica/personal.md («PIN del taller»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { pinesDelTaller } from "@uniformame/compartido/contratos/personal/pines";
import { useConsulta } from "../../comun/api.tsx";
import { SegunConsulta } from "../../comun/segun-consulta.tsx";
import { busquedaDePersonal } from "../../departamentos/personal/direccion.ts";
import { PaginaDePersonal } from "../../departamentos/personal/pagina.tsx";
import { PinDePersonal } from "../../departamentos/personal/pestanas/pin.tsx";

/** La pantalla de PIN del taller. */
function Pin() {
	const consulta = useConsulta(pinesDelTaller, {});
	return (
		<PaginaDePersonal activa="pin">
			<SegunConsulta consulta={consulta}>{(datos) => <PinDePersonal datos={datos} />}</SegunConsulta>
		</PaginaDePersonal>
	);
}

export const Route = createFileRoute("/personal/pin")({
	validateSearch: busquedaDePersonal,
	component: Pin,
});
