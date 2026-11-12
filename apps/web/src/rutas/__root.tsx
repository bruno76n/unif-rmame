/**
 * La raíz de las rutas: el armazón para todo, salvo la pantalla de entrada y la vuelta de «Confirmar con Google».
 * Fase 19 · docs/cimientos/ESTRUCTURA.md («Las pantallas por dentro») y docs/interfaz/comunes.md («El armazón»)
 */

import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet, useRouterState } from "@tanstack/react-router";
import { ArmazonDeLaWeb } from "../comun/armazon-de-la-web.tsx";

/** La raíz: fuera del armazón, solo `/acceso`. */
function Raiz() {
	const ruta = useRouterState({ select: (estado) => estado.location.pathname });
	return ruta.startsWith("/acceso") ? <Outlet /> : <ArmazonDeLaWeb />;
}

export const Route = createRootRouteWithContext<{ consultas: QueryClient }>()({ component: Raiz });
