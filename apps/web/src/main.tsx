/// <reference types="vite/client" />
/**
 * Arranca la web: TanStack Query para los datos, TanStack Router con las rutas por archivo y el aviso de abajo.
 * Fase 19 · docs/cimientos/ESTRUCTURA.md («Las pantallas por dentro») y .claude/rules/react.md (regla 5)
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { routeTree } from "./arbol-de-rutas.gen.ts";
import { AvisosDeAbajo } from "./comun/avisos-de-abajo.tsx";
import "./estilos.css";

const consultas = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });
const enrutador = createRouter({ routeTree, context: { consultas } });

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof enrutador;
	}
}

const raiz = document.getElementById("raiz");
if (raiz === null) throw new Error("falta el elemento raíz de la web");
createRoot(raiz).render(
	<StrictMode>
		<QueryClientProvider client={consultas}>
			<AvisosDeAbajo>
				<RouterProvider router={enrutador} />
			</AvisosDeAbajo>
		</QueryClientProvider>
	</StrictMode>,
);
