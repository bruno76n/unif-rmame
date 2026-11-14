/**
 * Autorizaciones de Dirección (`/direccion/autorizaciones`): lee `direccion.autorizaciones` con el filtro de la
 * dirección (`?tipo=nota_credito`) y entrega los datos a su pestaña, que decide cada autorización.
 * Fase 19 · docs/interfaz/fabrica/direccion.md («Autorizaciones») y .claude/rules/react.md
 *
 * Un filtro que se quedó sin tarjetas regresa a «Todas».
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { autorizaciones, tiposDeAutorizacion } from "@uniformame/compartido/contratos/direccion/autorizaciones";
import { useEffect } from "react";
import { z } from "zod";
import { useConsulta } from "../../comun/api.tsx";
import { SegunConsulta } from "../../comun/segun-consulta.tsx";
import { PaginaDeDireccion } from "../../departamentos/direccion/pagina-de-direccion.tsx";
import { PestanaAutorizaciones } from "../../departamentos/direccion/pestanas/autorizaciones.tsx";

/** El filtro de las tarjetas en la dirección; sin él, «Todas». */
const busqueda = z.object({ tipo: z.enum(tiposDeAutorizacion).optional() });

/** La ruta de Autorizaciones. */
function Autorizaciones() {
	const { tipo } = Route.useSearch();
	const navegar = useNavigate({ from: "/direccion/autorizaciones" });
	const leida = useConsulta(autorizaciones, tipo === undefined ? {} : { tipo });
	// Un filtro que se quedó sin tarjetas regresa a «Todas».
	const filtros = leida.data?.filtros;
	useEffect(() => {
		if (tipo !== undefined && filtros !== undefined && !filtros.some((filtro) => filtro.tipo === tipo)) {
			void navegar({ search: {}, replace: true });
		}
	}, [tipo, filtros, navegar]);
	return (
		<PaginaDeDireccion activa="autorizaciones">
			<SegunConsulta consulta={leida}>
				{(datos) => (
					<PestanaAutorizaciones
						datos={datos}
						filtro={tipo ?? "todas"}
						alEscogerFiltro={(filtro) =>
							navegar({ search: { tipo: busqueda.shape.tipo.catch(undefined).parse(filtro) } })
						}
					/>
				)}
			</SegunConsulta>
		</PaginaDeDireccion>
	);
}

export const Route = createFileRoute("/direccion/autorizaciones")({
	validateSearch: busqueda,
	component: Autorizaciones,
});
