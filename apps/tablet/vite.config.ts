/**
 * La configuración de Vite de la tablet: React, Tailwind, el proxy de `/v1` a la API (la tablet y la API comparten
 * origen en local) y su service worker, que guarda lo que arma Vite para abrir sin internet.
 * Fase 20 · docs/apps/tablet.md (regla 1 y «Cómo se actualiza») y docs/cimientos/ESTRUCTURA.md
 *
 * `UNIFORMAME_API` dice dónde está la API (por omisión, la de `pnpm local`).
 */

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { serviceWorker } from "./src/service-worker/plugin.ts";

const api = process.env.UNIFORMAME_API ?? "http://localhost:3000";

export default defineConfig({
	plugins: [react(), tailwindcss(), serviceWorker()],
	server: { proxy: { "/v1": { target: api, changeOrigin: true } } },
});
