/**
 * El gancho después de editar de Claude Code (`PostToolUse` de Edit, Write y NotebookEdit en `.claude/settings.json`).
 * Fase 1 · docs/trabajo/FORMA-DE-TRABAJO.md («Los verdes») y CLAUDE.md («Ganchos»)
 *
 * Corre la revisión rápida de lo cambiado después de cada edición. Si sale en rojo, sale con el código 2
 * y Claude ve el final de la salida como aviso: la edición ya se hizo, así que no la deshace.
 */

import { spawnSync } from "node:child_process";

if (import.meta.main) {
	const raiz = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
	const corrida = spawnSync(process.execPath, ["scripts/revision-rapida.ts"], { cwd: raiz, encoding: "utf8" });
	if (corrida.status !== 0) {
		const salida = `${corrida.stdout}${corrida.stderr}`.trim().split("\n").slice(-30).join("\n");
		console.error(`Revisión rápida en rojo después de editar:\n${salida}`);
		process.exit(2);
	}
}
