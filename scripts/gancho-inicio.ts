/**
 * El gancho de inicio de Claude Code (`SessionStart` en `.claude/settings.json`).
 * Fase 1 y fase 2 · docs/trabajo/FORMA-DE-TRABAJO.md («El entorno de la nube») y CLAUDE.md («Ganchos»)
 *
 * En la nube, cada sesión arranca con el repositorio recién clonado: este gancho corre
 * `pnpm install --frozen-lockfile`, que instala exactamente el lockfile y, con el `prepare` de la raíz,
 * deja activo el gancho de git (`core.hooksPath`). Además, si Docker no responde, arranca su daemon:
 * la máquina de la nube trae Docker pero no lo deja corriendo, y las pruebas de la base lo necesitan.
 * Fuera de la nube no hace nada: en la Mac se instala a mano una vez y Docker Desktop ya corre.
 * La nube se reconoce por `CLAUDE_CODE_REMOTE=true`, que Claude Code pone solo.
 */

import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as esperar } from "node:timers/promises";

/** Cuánto se espera a que el daemon de Docker responda. */
const esperaDeDocker = 60;

/** Dice si Docker responde. */
function dockerResponde(): boolean {
	return spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
}

/**
 * Deja Docker respondiendo: si no responde, arranca `dockerd` aparte y espera a que conteste.
 * @returns `true` si Docker responde al final.
 */
async function asegurarDocker(): Promise<boolean> {
	if (dockerResponde()) return true;
	const daemon = spawn("dockerd", [], { detached: true, stdio: "ignore" });
	daemon.on("error", () => undefined);
	daemon.unref();
	for (let segundo = 0; segundo < esperaDeDocker; segundo++) {
		await esperar(1000);
		if (dockerResponde()) return true;
	}
	return false;
}

/**
 * Deja a Playwright el Chromium que trae la máquina de la nube, en el archivo de variables de la sesión
 * (`CLAUDE_ENV_FILE`), si los dos existen. La carpeta sale de `PLAYWRIGHT_BROWSERS_PATH`.
 * @returns `true` si lo dejó.
 */
function dejarChromium(): boolean {
	const navegadores = process.env.PLAYWRIGHT_BROWSERS_PATH;
	const variablesDeLaSesion = process.env.CLAUDE_ENV_FILE;
	if (navegadores === undefined || variablesDeLaSesion === undefined) return false;
	const chromium = join(navegadores, "chromium");
	if (!existsSync(chromium)) return false;
	appendFileSync(variablesDeLaSesion, `export CHROMIUM_EJECUTABLE=${JSON.stringify(chromium)}\n`);
	return true;
}

if (import.meta.main) {
	if (process.env.CLAUDE_CODE_REMOTE !== "true") process.exit(0);
	const raiz = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
	const resultado = spawnSync("pnpm", ["install", "--frozen-lockfile"], { cwd: raiz, encoding: "utf8" });
	if (resultado.status !== 0) {
		console.error(`Gancho de inicio: pnpm install falló.\n${resultado.stdout}${resultado.stderr}`.slice(-4000));
		process.exit(1);
	}
	const docker = (await asegurarDocker())
		? "Docker responde."
		: "Docker no respondió: las pruebas de la base no van a correr.";
	const chromium = dejarChromium() ? " Playwright usa el Chromium de la máquina." : "";
	// Lo que sale por la salida estándar de un SessionStart llega como contexto de la sesión.
	console.log(
		`Gancho de inicio: dependencias instaladas con pnpm install y gancho de git activo (core.hooksPath = .githooks). ${docker}${chromium}`,
	);
}
