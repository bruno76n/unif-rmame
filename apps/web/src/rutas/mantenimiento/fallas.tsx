/**
 * Fallas de Mantenimiento: lee las abiertas de `mantenimiento.fallas` y entrega la pestaña, que pide las resueltas por
 * páginas al desplegarlas.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Fallas»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { fallasDeMantenimiento } from "@uniformame/compartido/contratos/mantenimiento/consultas-pestanas";
import { useConsulta } from "../../comun/api.tsx";
import { SegunConsulta } from "../../comun/segun-consulta.tsx";
import { busquedaDeMantenimiento } from "../../departamentos/mantenimiento/direccion.ts";
import { PaginaDeMantenimiento } from "../../departamentos/mantenimiento/pagina.tsx";
import { FallasDeMantenimiento } from "../../departamentos/mantenimiento/pestanas/fallas.tsx";

/** La pantalla de Fallas. */
function Fallas() {
	const consulta = useConsulta(fallasDeMantenimiento, { grupo: "abiertas" });
	return (
		<PaginaDeMantenimiento activa="fallas">
			<SegunConsulta consulta={consulta}>{(abiertas) => <FallasDeMantenimiento abiertas={abiertas} />}</SegunConsulta>
		</PaginaDeMantenimiento>
	);
}

export const Route = createFileRoute("/mantenimiento/fallas")({
	validateSearch: busquedaDeMantenimiento,
	component: Fallas,
});
