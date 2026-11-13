/**
 * Pendientes de Dirección (`/direccion`): lee `direccion.pendientes` y arma la pestaña. El filtro del panel va en la
 * dirección (`?grupo=autorizaciones`), así un enlace abre la pantalla tal como estaba.
 * Fase 19 · docs/interfaz/fabrica/direccion.md («Pendientes») y .claude/rules/react.md (regla 5)
 */

import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { gruposDePendientes, pendientes } from "@uniformame/compartido/contratos/direccion/pendientes";
import { z } from "zod";
import { useConsulta } from "../../comun/api.tsx";
import { SegunConsulta } from "../../comun/segun-consulta.tsx";
import { PaginaDeDireccion } from "../../departamentos/direccion/pagina-de-direccion.tsx";
import { PestanaPendientes } from "../../departamentos/direccion/pestanas/pendientes.tsx";

/** El filtro del panel en la dirección; sin él, «Todos». */
const busqueda = z.object({ grupo: z.enum(gruposDePendientes).optional() });

/** La ruta de Pendientes. */
function Pendientes() {
	const { grupo } = Route.useSearch();
	const navegar = useNavigate({ from: "/direccion/" });
	const router = useRouter();
	const leida = useConsulta(pendientes, {});
	return (
		<PaginaDeDireccion activa="pendientes">
			<SegunConsulta consulta={leida}>
				{(datos) => (
					<PestanaPendientes
						datos={datos}
						filtro={grupo ?? "todos"}
						alEscogerFiltro={(filtro) =>
							navegar({ search: { grupo: busqueda.shape.grupo.catch(undefined).parse(filtro) } })
						}
						ir={(ruta) => router.history.push(`/${ruta}`)}
					/>
				)}
			</SegunConsulta>
		</PaginaDeDireccion>
	);
}

export const Route = createFileRoute("/direccion/")({ validateSearch: busqueda, component: Pendientes });
