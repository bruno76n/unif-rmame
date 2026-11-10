/**
 * Prueba del gancho de git antes de cada commit.
 * Fase 1 · docs/fases/01-repositorio-reglas-y-paquete-compartido.md (parte 2)
 */

import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarRepositorioDePrueba, crearRepositorioDePrueba, escribir, git } from "./repositorio-de-prueba.ts";
import { guardarSello, huellaDelArbol } from "./sello.ts";

/** Intenta un commit con todo lo que hay, con el gancho activo, y regresa si entró y lo que dijo. */
function commit(raiz: string): { entra: boolean; salida: string } {
	git(raiz, ["add", "-A"]);
	const resultado = spawnSync("git", ["commit", "-q", "-m", "prueba"], { cwd: raiz, encoding: "utf8" });
	return { entra: resultado.status === 0, salida: `${resultado.stdout}${resultado.stderr}` };
}

/** Sella el árbol tal como está, como lo haría la revisión completa en verde. */
function sellar(raiz: string): void {
	guardarSello(raiz, huellaDelArbol(raiz));
}

describe("el gancho de git rechaza un commit de código sin sello vigente, deja pasar uno con sello, uno de solo registros y uno de solo documentos con pnpm docs:revisar en verde, y rechaza uno de documentos con un enlace roto", () => {
	let raiz = "";
	beforeEach(() => {
		raiz = crearRepositorioDePrueba();
		git(raiz, ["config", "core.hooksPath", ".githooks"]);
	});
	afterEach(() => borrarRepositorioDePrueba(raiz));

	it("rechaza un commit de código sin sello", () => {
		escribir(raiz, "scripts/ejemplo.ts", "export const a = 1;\n");
		const { entra, salida } = commit(raiz);
		expect(entra).toBe(false);
		expect(salida).toContain("sello");
	});

	it("deja pasar un commit de código con sello vigente", () => {
		escribir(raiz, "scripts/ejemplo.ts", "export const a = 1;\n");
		sellar(raiz);
		const { entra, salida } = commit(raiz);
		expect(entra, salida).toBe(true);
	});

	it("rechaza un commit de código cuando el sello es de otra cosa", () => {
		escribir(raiz, "scripts/ejemplo.ts", "export const a = 1;\n");
		sellar(raiz);
		escribir(raiz, "scripts/ejemplo.ts", "export const a = 2;\n");
		const { entra } = commit(raiz);
		expect(entra).toBe(false);
	});

	it("el sello sigue vigente si después de sellar solo se escriben registros", () => {
		escribir(raiz, "scripts/ejemplo.ts", "export const a = 1;\n");
		sellar(raiz);
		escribir(raiz, "docs/registros/BITACORA.md", "# Bitácora\n");
		const { entra, salida } = commit(raiz);
		expect(entra, salida).toBe(true);
	});

	it("deja pasar un commit de solo registros, sin sello", () => {
		escribir(raiz, "docs/registros/sesiones/2026-11-10-fase-01.md", "# Sesión\n");
		const { entra, salida } = commit(raiz);
		expect(entra, salida).toBe(true);
	});

	it("deja pasar un commit de solo documentos con pnpm docs:revisar en verde", () => {
		escribirIndice(raiz, "");
		const { entra, salida } = commit(raiz);
		expect(entra, salida).toBe(true);
	});

	it("rechaza un commit de documentos con un enlace roto", () => {
		escribirIndice(raiz, "Ver [lo que no existe](no-existe.md).\n");
		const { entra, salida } = commit(raiz);
		expect(entra).toBe(false);
		expect(salida).toContain("no-existe.md");
	});
});

/** Escribe un índice bien formado, que se lista a sí mismo, con un texto al final. */
function escribirIndice(raiz: string, texto: string): void {
	escribir(
		raiz,
		"docs/INDICE.md",
		`# Índice\n\n> **Qué cubre:** todo.\n> **Estado:** Decidido.\n> **Se construye en:** [fase 1](INDICE.md).\n> **Se conecta con:** \n\n- [Índice](INDICE.md) — todo.\n\n${texto}`,
	);
}
