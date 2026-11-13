/**
 * Configuración de Vitest para todo el monorepo.
 * Fase 1 y fase 2 · docs/cimientos/PRUEBAS.md y .claude/rules/pruebas.md
 *
 * Las pruebas van junto a su código con el nombre `*.prueba.ts` (ver docs/cimientos/ESTRUCTURA.md).
 * Tres proyectos: «calculos», sin base; «base» (el núcleo de la base y la base de las pruebas) y «api»
 * (el protocolo, el corredor y los módulos), que levantan cada uno un Postgres 18 con Testcontainers una
 * vez por corrida y le dan a cada archivo su copia de la plantilla. Una prueba con base tiene hasta 2 minutos: las
 * de datos al azar corren miles de transacciones, y con varios trabajadores probando a la vez 30 s no alcanzan.
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
					include: ["apps/api/src/nucleo/base/**/*.prueba.{ts,tsx}", "pruebas/**/*.prueba.{ts,tsx}"],
					exclude: fuera,
					globalSetup: ["apps/api/src/nucleo/base/plantilla-de-pruebas.ts"],
					testTimeout: 120_000,
					hookTimeout: 180_000,
				},
			},
			{
				test: {
					name: "api",
					include: ["apps/**/*.prueba.{ts,tsx}"],
					exclude: [...fuera, "apps/api/src/nucleo/base/**"],
					globalSetup: ["apps/api/src/nucleo/base/plantilla-de-pruebas.ts"],
					testTimeout: 120_000,
					hookTimeout: 180_000,
				},
			},
		],
	},
});
