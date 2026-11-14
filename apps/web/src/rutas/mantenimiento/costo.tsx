/**
 * Costo por máquina de Mantenimiento: lee de la dirección el costo de la hora escrito en la pantalla, pide
 * `mantenimiento.costo_por_maquina` con él y la entrega a su pestaña.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Costo por máquina»)
 *
 * Mientras llega el cálculo con otro costo, la pestaña sigue mostrando el anterior: así la casilla no pierde lo que se
 * está escribiendo.
 */

import { createFileRoute } from "@tanstack/react-router";
import { pesosACentavos } from "@uniformame/compartido/calculos/dinero";
import { costoPorMaquina } from "@uniformame/compartido/contratos/mantenimiento/consultas-pestanas";
import { useConsulta } from "../../comun/api.tsx";
import { SegunConsulta } from "../../comun/segun-consulta.tsx";
import { busquedaDeMantenimiento, useDireccionDeMantenimiento } from "../../departamentos/mantenimiento/direccion.ts";
import { PaginaDeMantenimiento } from "../../departamentos/mantenimiento/pagina.tsx";
import { CostoDeMantenimiento } from "../../departamentos/mantenimiento/pestanas/costo.tsx";

/** La pantalla de Costo por máquina. */
function Costo() {
	const { busqueda } = useDireccionDeMantenimiento();
	// La casilla va en pesos enteros; la consulta, en centavos. Vacía o en 0, el de Configuración.
	const costo = busqueda.hora === undefined ? null : pesosACentavos(String(busqueda.hora));
	const parametros = costo === null ? {} : { costo_hora_centavos: costo };
	const consulta = useConsulta(costoPorMaquina, parametros, true, true);
	return (
		<PaginaDeMantenimiento activa="costo">
			<SegunConsulta consulta={consulta}>{(datos) => <CostoDeMantenimiento datos={datos} />}</SegunConsulta>
		</PaginaDeMantenimiento>
	);
}

export const Route = createFileRoute("/mantenimiento/costo")({
	validateSearch: busquedaDeMantenimiento,
	component: Costo,
});
