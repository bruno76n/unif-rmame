/**
 * Indicadores de Dirección (`/direccion/indicadores`): lee `direccion.indicadores` con la comparación de la dirección
 * (`?comparar=hace_un_mes`; al abrir, la semana pasada).
 * Fase 19 · docs/interfaz/fabrica/direccion.md («Indicadores») y .claude/rules/react.md (regla 5)
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { comparaciones, indicadores } from "@uniformame/compartido/contratos/direccion/indicadores";
import { z } from "zod";
import { useConsulta } from "../../comun/api.tsx";
import { SegunConsulta } from "../../comun/segun-consulta.tsx";
import { PaginaDeDireccion } from "../../departamentos/direccion/pagina-de-direccion.tsx";
import { PestanaIndicadores } from "../../departamentos/direccion/pestanas/indicadores.tsx";

/** La comparación en la dirección; sin ella, la semana pasada. */
const busqueda = z.object({ comparar: z.enum(comparaciones).optional() });

/** La ruta de Indicadores. */
function Indicadores() {
	const { comparar } = Route.useSearch();
	const navegar = useNavigate({ from: "/direccion/indicadores" });
	const leida = useConsulta(indicadores, comparar === undefined ? {} : { comparar });
	return (
		<PaginaDeDireccion activa="indicadores">
			<SegunConsulta consulta={leida}>
				{(datos) => (
					<PestanaIndicadores
						datos={datos}
						comparar={comparar ?? "semana_pasada"}
						alComparar={(otra) => navegar({ search: { comparar: otra === "semana_pasada" ? undefined : otra } })}
					/>
				)}
			</SegunConsulta>
		</PaginaDeDireccion>
	);
}

export const Route = createFileRoute("/direccion/indicadores")({ validateSearch: busqueda, component: Indicadores });
