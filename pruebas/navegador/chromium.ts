/**
 * El Chromium de las pruebas de pantalla: el que dice `CHROMIUM_EJECUTABLE` o, si no llegó (los ganchos de Claude Code
 * no reciben las variables de la sesión), el de la máquina de la nube en `PLAYWRIGHT_BROWSERS_PATH/chromium`, la misma
 * regla con que el gancho de inicio deja esa variable (`scripts/gancho-inicio.ts`, que no puede importar de aquí porque
 * sus pruebas lo corren solo). Sin ninguno, Playwright usa el suyo.
 * Fase 19 · docs/cimientos/PRUEBAS.md («Los niveles»: pantallas)
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Las opciones para abrir Chromium en una prueba.
 * @returns `{ executablePath }` con el de la máquina, o nada para el de Playwright.
 */
export function opcionesDeChromium(): { executablePath?: string } {
	const dicho = process.env.CHROMIUM_EJECUTABLE;
	if (dicho !== undefined) return { executablePath: dicho };
	const navegadores = process.env.PLAYWRIGHT_BROWSERS_PATH;
	const deLaMaquina = navegadores === undefined ? undefined : join(navegadores, "chromium");
	return deLaMaquina !== undefined && existsSync(deLaMaquina) ? { executablePath: deLaMaquina } : {};
}
