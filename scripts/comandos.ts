/**
 * Cómo corren las revisiones y los ganchos las herramientas del monorepo.
 * Fase 1 · docs/cimientos/ESTRUCTURA.md («Comandos»)
 *
 * Las herramientas se llaman desde `node_modules/.bin` de la raíz, sin pasar por pnpm, para que el
 * mismo código sirva en la nube, en la Mac y en los repositorios temporales de las pruebas.
 */

import { spawnSync } from "node:child_process";
import { join } from "node:path";

/**
 * Corre una herramienta del monorepo y deja ver su salida.
 * @param raiz La carpeta del repositorio.
 * @param herramienta El nombre del binario en `node_modules/.bin` (`biome`, `tsc`, `vitest`), `node` o `pnpm`.
 * @param argumentos Lo que va después.
 * @returns `true` si salió en verde. Si la herramienta no se pudo arrancar (por ejemplo, falta
 * `node_modules`), lo dice y regresa `false`.
 */
export function correr(raiz: string, herramienta: string, argumentos: string[]): boolean {
	// Node es el que corre este script; pnpm es el del sistema; lo demás, el del monorepo.
	const ejecutable =
		herramienta === "node"
			? process.execPath
			: herramienta === "pnpm"
				? "pnpm"
				: join(raiz, "node_modules", ".bin", herramienta);
	const resultado = spawnSync(ejecutable, argumentos, { cwd: raiz, stdio: "inherit" });
	if (resultado.error) {
		console.error(`No se pudo correr ${herramienta}: ${resultado.error.message}. ¿Falta correr pnpm install?`);
		return false;
	}
	return resultado.status === 0;
}

/**
 * Corre la revisión rápida guardando lo que dice, para los ganchos de Claude Code.
 * @param raiz La carpeta del repositorio.
 * @returns Si pasó y todo lo que escribió.
 */
export function revisionRapidaCapturada(raiz: string): { pasa: boolean; salida: string } {
	const corrida = spawnSync(process.execPath, [join(raiz, "scripts/revision-rapida.ts")], {
		cwd: raiz,
		encoding: "utf8",
	});
	return { pasa: corrida.status === 0, salida: `${corrida.stdout ?? ""}${corrida.stderr ?? ""}` };
}

/**
 * El final de una salida, que es donde están los errores; es lo que los ganchos le pasan a Claude.
 * @param salida Todo lo que escribió una revisión.
 * @returns Sus últimos 30 renglones.
 */
export function finalDeLaSalida(salida: string): string {
	return salida.trim().split("\n").slice(-30).join("\n");
}
