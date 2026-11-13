/**
 * Prueba del gancho después de editar de Claude Code.
 * Fase 1 · docs/fases/01-repositorio-reglas-y-paquete-compartido.md (parte 4)
 * Fase 19 · docs/trabajo/FORMA-DE-TRABAJO.md («Trabajo en paralelo»): en el worktree de un trabajador, revisa ese worktree.
 */

import { spawnSync } from "node:child_process";
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { git } from "./archivos.ts";
import { borrarRepositorioDePrueba, crearRepositorioDePrueba, escribir, raizReal } from "./repositorio-de-prueba.ts";

/**
 * Corre el gancho como lo corre Claude Code después de una edición.
 * @param raiz El repositorio del proyecto (`CLAUDE_PROJECT_DIR`).
 * @param archivo El archivo editado, como lo manda Claude Code (ruta completa).
 */
function ganchoDeEdicion(
	raiz: string,
	archivo = join(raiz, "scripts/a.ts"),
): { codigo: number | null; errores: string } {
	const resultado = spawnSync(process.execPath, [join(raiz, "scripts/gancho-edicion.ts")], {
		cwd: raiz,
		env: { ...process.env, CLAUDE_PROJECT_DIR: raiz },
		input: JSON.stringify({
			hook_event_name: "PostToolUse",
			tool_name: "Write",
			tool_input: { file_path: archivo },
		}),
		encoding: "utf8",
	});
	return { codigo: resultado.status, errores: resultado.stderr };
}

describe("el gancho después de editar corre la revisión rápida de lo cambiado", () => {
	let raiz = "";
	beforeEach(() => {
		raiz = crearRepositorioDePrueba();
	});
	afterEach(() => borrarRepositorioDePrueba(raiz));

	it("con lo cambiado en verde, sale en silencio", () => {
		escribir(raiz, "scripts/a.ts", "/** Ejemplo. */\nexport const a: number = 1;\n");
		expect(ganchoDeEdicion(raiz).codigo).toBe(0);
	});

	it("con un error en lo cambiado, sale con el código 2 y se lo dice a Claude", () => {
		escribir(raiz, "scripts/a.ts", '/** Ejemplo. */\nexport const a: number = "uno";\n');
		const { codigo, errores } = ganchoDeEdicion(raiz);
		expect(codigo).toBe(2);
		expect(errores).toContain("TS2322");
	});

	it("si el archivo editado es de un worktree de un trabajador, revisa ese worktree y no el proyecto", () => {
		// El proyecto tiene un error que no es del trabajador; el worktree del trabajador está en verde.
		escribir(raiz, "scripts/a.ts", '/** Ejemplo. */\nexport const a: number = "uno";\n');
		const worktree = join(raiz, ".claude", "worktrees", "agent-prueba");
		git(raiz, ["worktree", "add", "-q", worktree, "-b", "trabajador-prueba"]);
		symlinkSync(join(raizReal, "node_modules"), join(worktree, "node_modules"), "dir");
		escribir(worktree, "scripts/b.ts", "/** Ejemplo. */\nexport const b: number = 2;\n");
		expect(ganchoDeEdicion(raiz, join(worktree, "scripts/b.ts")).codigo).toBe(0);
		// Y un error en el worktree sí se ve.
		escribir(worktree, "scripts/b.ts", '/** Ejemplo. */\nexport const b: number = "dos";\n');
		expect(ganchoDeEdicion(raiz, join(worktree, "scripts/b.ts")).codigo).toBe(2);
	});
});
