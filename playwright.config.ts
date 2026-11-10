/**
 * Configuración de Playwright para las pruebas en el navegador de las fases 19 (pantallas contra la
 * muestra) y 21 (punta a punta).
 * Fase 2 · docs/cimientos/PRUEBAS.md («Los niveles»)
 *
 * Los archivos de Playwright se llaman `*.navegador.ts`, para que Vitest no los tome. El ejecutable de
 * Chromium es el que instala Playwright, salvo que `CHROMIUM_EJECUTABLE` diga otro: en la nube lo pone
 * el gancho de inicio, porque la máquina trae su propio Chromium.
 */
import { defineConfig, devices } from "@playwright/test";

const ejecutable = process.env.CHROMIUM_EJECUTABLE;

export default defineConfig({
	testMatch: "**/*.navegador.ts",
	testIgnore: ["**/node_modules/**", ".claude/worktrees/**"],
	fullyParallel: true,
	reporter: "list",
	use: {
		trace: "off",
		...(ejecutable === undefined ? {} : { launchOptions: { executablePath: ejecutable } }),
	},
	projects: [
		{ name: "escritorio", use: { ...devices["Desktop Chrome"] } },
		{ name: "telefono", use: { ...devices["Pixel 7"] } },
	],
});
