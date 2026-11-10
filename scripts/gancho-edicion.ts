/**
 * El gancho después de editar de Claude Code (`PostToolUse` de Edit, Write y NotebookEdit en `.claude/settings.json`).
 * Fase 1 · docs/trabajo/FORMA-DE-TRABAJO.md («Los verdes») y CLAUDE.md («Ganchos»)
 *
 * Corre la revisión rápida de lo cambiado después de cada edición. Si sale en rojo, sale con el código 2
 * y Claude ve el final de la salida como aviso: la edición ya se hizo, así que no la deshace.
 */

import { finalDeLaSalida, revisionRapidaCapturada } from "./comandos.ts";

if (import.meta.main) {
	const { pasa, salida } = revisionRapidaCapturada(process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
	if (!pasa) {
		console.error(`Revisión rápida en rojo después de editar:\n${finalDeLaSalida(salida)}`);
		process.exit(2);
	}
}
