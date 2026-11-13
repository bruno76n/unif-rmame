/**
 * El gancho después de editar de Claude Code (`PostToolUse` de Edit, Write y NotebookEdit en `.claude/settings.json`).
 * Fase 1 · docs/trabajo/FORMA-DE-TRABAJO.md («Los verdes») y CLAUDE.md («Ganchos»)
 * Fase 19 · docs/trabajo/FORMA-DE-TRABAJO.md («Trabajo en paralelo»)
 *
 * Corre la revisión rápida de lo cambiado después de cada edición, en el repositorio del archivo editado: el del
 * proyecto o el worktree de un trabajador (Claude Code les da a todos el mismo `CLAUDE_PROJECT_DIR`). Si sale en rojo,
 * sale con el código 2 y Claude ve el final de la salida como aviso: la edición ya se hizo, así que no la deshace.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { git } from "./archivos.ts";
import { finalDeLaSalida, revisionRapidaCapturada } from "./comandos.ts";

/**
 * El repositorio donde está el archivo que se editó.
 * @param entrada Lo que Claude Code manda al gancho (su `tool_input.file_path`).
 * @param proyecto El repositorio del proyecto, si el archivo no dice otro.
 * @returns La raíz del repositorio o del worktree del archivo; si no se puede saber, el del proyecto.
 */
export function repositorioDelArchivo(entrada: unknown, proyecto: string): string {
	const herramienta =
		typeof entrada === "object" && entrada !== null && "tool_input" in entrada ? entrada.tool_input : undefined;
	const archivo =
		typeof herramienta === "object" && herramienta !== null && "file_path" in herramienta
			? herramienta.file_path
			: undefined;
	if (typeof archivo !== "string" || !archivo.startsWith("/") || !existsSync(dirname(archivo))) return proyecto;
	try {
		return git(dirname(archivo), ["rev-parse", "--show-toplevel"]).trim() || proyecto;
	} catch {
		// Un archivo fuera de un repositorio (la libreta de notas, por ejemplo): se revisa el proyecto.
		return proyecto;
	}
}

if (import.meta.main) {
	const proyecto = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
	let entrada: unknown;
	try {
		entrada = JSON.parse(readFileSync(0, "utf8"));
	} catch {
		entrada = undefined;
	}
	const { pasa, salida } = revisionRapidaCapturada(repositorioDelArchivo(entrada, proyecto));
	if (!pasa) {
		console.error(`Revisión rápida en rojo después de editar:\n${finalDeLaSalida(salida)}`);
		process.exit(2);
	}
}
