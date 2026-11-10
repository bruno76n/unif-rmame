/**
 * Prueba del gancho después de editar de Claude Code.
 * Fase 1 · docs/fases/01-repositorio-reglas-y-paquete-compartido.md (parte 4)
 */

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarRepositorioDePrueba, crearRepositorioDePrueba, escribir } from "./repositorio-de-prueba.ts";

/** Corre el gancho como lo corre Claude Code después de una edición. */
function ganchoDeEdicion(raiz: string): { codigo: number | null; errores: string } {
	const resultado = spawnSync(process.execPath, [join(raiz, "scripts/gancho-edicion.ts")], {
		cwd: raiz,
		env: { ...process.env, CLAUDE_PROJECT_DIR: raiz },
		input: JSON.stringify({
			hook_event_name: "PostToolUse",
			tool_name: "Write",
			tool_input: { file_path: "scripts/a.ts" },
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
});
