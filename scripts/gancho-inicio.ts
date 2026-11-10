/**
 * El gancho de inicio de Claude Code (`SessionStart` en `.claude/settings.json`).
 * Fase 1 · docs/trabajo/FORMA-DE-TRABAJO.md («El entorno de la nube») y CLAUDE.md («Ganchos»)
 *
 * En la nube, cada sesión arranca con el repositorio recién clonado: este gancho corre
 * `pnpm install --frozen-lockfile`, que instala exactamente el lockfile y, con el `prepare` de la raíz,
 * deja activo el gancho de git (`core.hooksPath`). Fuera de la nube no hace nada: en la Mac se
 * instala a mano una vez. La nube se reconoce por `CLAUDE_CODE_REMOTE=true`, que Claude Code pone solo.
 */

import { spawnSync } from "node:child_process";

/**
 * Dice si la sesión corre en la nube.
 * @param entorno Las variables de entorno del proceso.
 */
function esLaNube(entorno: NodeJS.ProcessEnv): boolean {
	return entorno.CLAUDE_CODE_REMOTE === "true";
}

if (import.meta.main) {
	if (!esLaNube(process.env)) process.exit(0);
	const raiz = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
	const resultado = spawnSync("pnpm", ["install", "--frozen-lockfile"], { cwd: raiz, encoding: "utf8" });
	if (resultado.status !== 0) {
		console.error(`Gancho de inicio: pnpm install falló.\n${resultado.stdout}${resultado.stderr}`.slice(-4000));
		process.exit(1);
	}
	// Lo que sale por la salida estándar de un SessionStart llega como contexto de la sesión.
	console.log(
		"Gancho de inicio: dependencias instaladas con pnpm install y gancho de git activo (core.hooksPath = .githooks).",
	);
}
