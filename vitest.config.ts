/**
 * Configuración de Vitest para todo el monorepo.
 * Fase 1 · docs/cimientos/ARQUITECTURA.md (el stack) y .claude/rules/pruebas.md
 *
 * Las pruebas van junto a su código con el nombre `*.prueba.ts` (ver docs/cimientos/ESTRUCTURA.md).
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Solo los archivos de prueba con el nombre de Unifórmame; nada dentro de node_modules ni de los worktrees.
		include: ["**/*.prueba.ts", "**/*.prueba.tsx"],
		exclude: ["**/node_modules/**", "**/.git/**", ".claude/worktrees/**"],
	},
});
