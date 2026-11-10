/**
 * Prueba del gancho de inicio de Claude Code.
 * Fase 1 · docs/fases/01-repositorio-reglas-y-paquete-compartido.md (parte 4)
 *
 * Instala de verdad en un repositorio temporal sin enlazar `node_modules`, así que tarda unos segundos:
 * pnpm toma los paquetes de su almacén.
 */

import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { git } from "./archivos.ts";
import { borrarRepositorioDePrueba, crearRepositorioDePrueba } from "./repositorio-de-prueba.ts";

/** Corre el gancho de inicio como lo corre Claude Code, con o sin la marca de la nube. */
function ganchoDeInicio(raiz: string, enLaNube: boolean, antesDelPath = ""): { codigo: number | null; salida: string } {
	const entorno: NodeJS.ProcessEnv = {
		...process.env,
		CLAUDE_PROJECT_DIR: raiz,
		PATH: `${antesDelPath}${antesDelPath ? delimiter : ""}${process.env.PATH ?? ""}`,
	};
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

describe("en la nube, si Docker no responde, el gancho de inicio arranca su daemon", () => {
	let raiz = "";
	beforeEach(() => {
		raiz = crearRepositorioDePrueba({ dependencias: "por-instalar" });
	});
	afterEach(() => borrarRepositorioDePrueba(raiz));

	it("arranca dockerd y espera a que Docker responda", { timeout: 120_000 }, () => {
		// Un docker y un dockerd de mentira: docker responde solo después de que dockerd deja su marca.
		const falsos = join(raiz, "falsos");
		const marca = join(raiz, "dockerd-arranco");
		mkdirSync(falsos);
		writeFileSync(join(falsos, "docker"), `#!/bin/sh\n[ -f "${marca}" ]\n`);
		writeFileSync(join(falsos, "dockerd"), `#!/bin/sh\ntouch "${marca}"\n`);
		chmodSync(join(falsos, "docker"), 0o755);
		chmodSync(join(falsos, "dockerd"), 0o755);
		const { codigo, salida } = ganchoDeInicio(raiz, true, falsos);
		expect(codigo, salida).toBe(0);
		expect(existsSync(marca)).toBe(true);
		expect(salida).toContain("Docker responde.");
	});
});

describe("en la nube, el gancho de inicio le deja a Playwright el Chromium de la máquina", () => {
	let raiz = "";
	beforeEach(() => {
		raiz = crearRepositorioDePrueba({ dependencias: "por-instalar" });
	});
	afterEach(() => borrarRepositorioDePrueba(raiz));

	it("escribe CHROMIUM_EJECUTABLE en el archivo de variables de la sesión", { timeout: 120_000 }, () => {
		const navegadores = join(raiz, "navegadores");
		const variables = join(raiz, "variables-de-la-sesion");
		mkdirSync(navegadores);
		writeFileSync(join(navegadores, "chromium"), "");
		writeFileSync(variables, "");
		const anteriores = { navegadores: process.env.PLAYWRIGHT_BROWSERS_PATH, variables: process.env.CLAUDE_ENV_FILE };
		process.env.PLAYWRIGHT_BROWSERS_PATH = navegadores;
		process.env.CLAUDE_ENV_FILE = variables;
		try {
			const { codigo, salida } = ganchoDeInicio(raiz, true);
			expect(codigo, salida).toBe(0);
			expect(readFileSync(variables, "utf8")).toContain(
				`export CHROMIUM_EJECUTABLE="${join(navegadores, "chromium")}"`,
			);
		} finally {
			for (const [nombre, valor] of [
				["PLAYWRIGHT_BROWSERS_PATH", anteriores.navegadores],
				["CLAUDE_ENV_FILE", anteriores.variables],
			] as const) {
				if (valor === undefined) delete process.env[nombre];
				else process.env[nombre] = valor;
			}
		}
	});
});
