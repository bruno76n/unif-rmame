/**
 * Cómo corren las revisiones las herramientas del monorepo.
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
 * @returns `true` si salió en verde.
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
	return resultado.status === 0;
}
