/**
 * Prueba del gancho de inicio de Claude Code.
 * Fase 1 · docs/fases/01-repositorio-reglas-y-paquete-compartido.md (parte 4)
 *
 * Instala de verdad en un repositorio temporal sin enlazar `node_modules`, así que tarda unos segundos:
 * pnpm toma los paquetes de su almacén.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarRepositorioDePrueba, crearRepositorioDePrueba, git } from "./repositorio-de-prueba.ts";

/** Corre el gancho de inicio como lo corre Claude Code, con o sin la marca de la nube. */
function ganchoDeInicio(raiz: string, enLaNube: boolean): { codigo: number | null; salida: string } {
	const entorno: NodeJS.ProcessEnv = { ...process.env, CLAUDE_PROJECT_DIR: raiz };
	delete entorno.CLAUDE_CODE_REMOTE;
	if (enLaNube) entorno.CLAUDE_CODE_REMOTE = "true";
	const resultado = spawnSync(process.execPath, [join(raiz, "scripts/gancho-inicio.ts")], {
		cwd: raiz,
		env: entorno,
		input: JSON.stringify({ hook_event_name: "SessionStart", source: "startup", cwd: raiz }),
		encoding: "utf8",
	});
	return { codigo: resultado.status, salida: `${resultado.stdout}${resultado.stderr}` };
}

/** Lee `core.hooksPath` del repositorio, o vacío si no está. */
function hooksPath(raiz: string): string {
	try {
		return git(raiz, ["config", "--local", "core.hooksPath"]).trim();
	} catch {
		return "";
	}
}

describe("el gancho de inicio, en la nube, instala las dependencias y deja core.hooksPath en .githooks; fuera de la nube no hace nada", () => {
	let raiz = "";
	beforeEach(() => {
		raiz = crearRepositorioDePrueba({ dependencias: "por-instalar" });
	});
	afterEach(() => borrarRepositorioDePrueba(raiz));

	it("en la nube instala las dependencias y activa el gancho de git", { timeout: 120_000 }, () => {
		const { codigo, salida } = ganchoDeInicio(raiz, true);
		expect(codigo, salida).toBe(0);
		expect(existsSync(join(raiz, "node_modules/.bin/vitest"))).toBe(true);
		expect(hooksPath(raiz)).toBe(".githooks");
	});

	it("fuera de la nube no instala nada ni toca git", () => {
		const { codigo } = ganchoDeInicio(raiz, false);
		expect(codigo).toBe(0);
		expect(existsSync(join(raiz, "node_modules"))).toBe(false);
		expect(hooksPath(raiz)).toBe("");
	});
});
