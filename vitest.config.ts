/**
 * Configuración de Vitest para todo el monorepo.
 * Fase 1 y fase 2 · docs/cimientos/PRUEBAS.md y .claude/rules/pruebas.md
 *
 * Las pruebas van junto a su código con el nombre `*.prueba.ts` (ver docs/cimientos/ESTRUCTURA.md).
 * Dos proyectos: «calculos», sin base, y «base», que levanta un Postgres 18 con Testcontainers una vez
 * por corrida y le da a cada archivo su copia de la plantilla.
 */
import { defineConfig } from "vitest/config";

/** Nada dentro de node_modules, de git ni de los worktrees de los trabajadores. */
const fuera = ["**/node_modules/**", "**/.git/**", ".claude/worktrees/**"];

export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: "calculos",
					include: ["packages/**/*.prueba.{ts,tsx}", "scripts/**/*.prueba.{ts,tsx}"],
					exclude: fuera,
				},
			},
			{
				test: {
					name: "base",
					include: ["apps/**/*.prueba.{ts,tsx}", "pruebas/**/*.prueba.{ts,tsx}"],
					exclude: fuera,
					globalSetup: ["apps/api/src/nucleo/base/plantilla-de-pruebas.ts"],
					testTimeout: 30_000,
					hookTimeout: 180_000,
				},
			},
		],
	},
});
