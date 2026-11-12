/**
 * La configuración de Vite de la web: React, Tailwind, las rutas por archivo de TanStack Router y el proxy de `/v1` a
 * la API, para que la web y la API compartan origen en local y la cookie de sesión viaje sola.
 * Fase 19 · docs/cimientos/ESTRUCTURA.md («Las pantallas por dentro») y docs/cimientos/ARQUITECTURA.md
 *
 * `UNIFORMAME_API` dice dónde está la API (por omisión, la de `pnpm local`); `UNIFORMAME_ORIGEN_WEB`, el origen que la
 * API espera en lo que escribe (las pruebas lo ponen con el suyo).
 */

import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const api = process.env.UNIFORMAME_API ?? "http://localhost:3000";
const origen = process.env.UNIFORMAME_ORIGEN_WEB;

export default defineConfig({
	plugins: [
		tanstackRouter({
			target: "react",
			routesDirectory: "./src/rutas",
			generatedRouteTree: "./src/arbol-de-rutas.gen.ts",
			quoteStyle: "double",
			addExtensions: true,
		}),
		react(),
		tailwindcss(),
	],
	server: {
		proxy: {
			"/v1": { target: api, changeOrigin: true, ...(origen === undefined ? {} : { headers: { origin: origen } }) },
		},
	},
});
