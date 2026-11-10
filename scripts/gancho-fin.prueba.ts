/**
 * Prueba del gancho de fin de Claude Code.
 * Fase 1 · docs/fases/01-repositorio-reglas-y-paquete-compartido.md (parte 4)
 *
 * Usa salidas de la revisión rápida simuladas: lo que se prueba es el conteo de intentos por problema
 * y el protocolo de cada modo, no la revisión.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { revisionRapidaCapturada } from "./comandos.ts";
import { archivoDeEstado, firmaDelProblema, procesarFin } from "./gancho-fin.ts";
import { borrarRepositorioDePrueba, crearRepositorioDePrueba, escribir, raizReal } from "./repositorio-de-prueba.ts";

const verde = { pasa: true, salida: "✓ Revisión rápida en verde." };
const errorDeTipos = {
	pasa: false,
	salida:
		"scripts/a.ts(3,10): error TS2322: Type 'string' is not assignable to type 'number'.\n✗ Revisión rápida en rojo: Tipos (tsc).",
};
/** El mismo error de tipos, en otro renglón: sigue siendo el mismo problema. */
const errorDeTiposMovido = {
	pasa: false,
	salida:
		"scripts/a.ts(7,2): error TS2322: Type 'string' is not assignable to type 'number'.\n✗ Revisión rápida en rojo: Tipos (tsc).",
};
const errorDeEstilo = {
	pasa: false,
	salida: "scripts/b.ts:1:1 lint/suspicious/noExplicitAny ━━━\n✗ Revisión rápida en rojo: Estilo (Biome).",
};

describe("el gancho de fin cuenta los intentos por problema y, al tercero, pide preguntar en supervisado y decidir y anotar en autonomo", () => {
	let raiz = "";
	beforeEach(() => {
		raiz = mkdtempSync(join(tmpdir(), "uniformame-fin-"));
	});
	afterEach(() => rmSync(raiz, { recursive: true, force: true }));

	/** Simula un fin de turno con el modo y la revisión dados. */
	function fin(modo: string, revision: { pasa: boolean; salida: string }, continuando = false) {
		escribir(raiz, ".claude/modo", `${modo}\n`);
		return procesarFin(raiz, revision, continuando);
	}

	it("en verde deja terminar el turno", () => {
		expect(fin("supervisado", verde).codigo).toBe(0);
	});

	it("en rojo no deja terminar y dice el número de intento", () => {
		const primero = fin("supervisado", errorDeTipos);
		expect(primero.codigo).toBe(2);
		expect(primero.mensaje).toContain("intento 1 de 3");
		const segundo = fin("supervisado", errorDeTiposMovido, true);
		expect(segundo.mensaje).toContain("intento 2 de 3");
	});

	it("en supervisado, al tercer intento sobre el mismo problema pide detenerse y preguntar a Bruno", () => {
		fin("supervisado", errorDeTipos);
		fin("supervisado", errorDeTipos, true);
		const tercero = fin("supervisado", errorDeTiposMovido, true);
		expect(tercero.codigo).toBe(2);
		expect(tercero.mensaje).toContain("Tercer intento");
		expect(tercero.mensaje).toContain("pregúntale a Bruno");
	});

	it("en autonomo, al tercer intento sobre el mismo problema pide decidir y anotar en REGISTROS.md", () => {
		fin("autonomo", errorDeTipos);
		fin("autonomo", errorDeTipos, true);
		const tercero = fin("autonomo", errorDeTipos, true);
		expect(tercero.codigo).toBe(2);
		expect(tercero.mensaje).toContain("Tercer intento");
		expect(tercero.mensaje).toContain("Decisiones autónomas");
		expect(tercero.mensaje).not.toContain("pregúntale a Bruno");
	});

	it("cuenta cada problema por separado", () => {
		fin("supervisado", errorDeTipos);
		fin("supervisado", errorDeTipos, true);
		const otro = fin("supervisado", errorDeEstilo, true);
		expect(otro.mensaje).toContain("intento 1 de 3");
		const vuelveElPrimero = fin("supervisado", errorDeTipos, true);
		expect(vuelveElPrimero.mensaje).toContain("Tercer intento");
	});

	it("un verde cierra los problemas y el conteo vuelve a empezar", () => {
		fin("supervisado", errorDeTipos);
		fin("supervisado", errorDeTipos, true);
		fin("supervisado", verde, true);
		expect(fin("supervisado", errorDeTipos).mensaje).toContain("intento 1 de 3");
	});

	it("después del tercer intento, si ya está continuando por el gancho, deja terminar para no dar vueltas", () => {
		fin("autonomo", errorDeTipos);
		fin("autonomo", errorDeTipos, true);
		fin("autonomo", errorDeTipos, true);
		const cuarto = fin("autonomo", errorDeTipos, true);
		expect(cuarto.codigo).toBe(0);
	});

	it("sin modo o con un modo desconocido, se porta como supervisado", () => {
		fin("quien-sabe", errorDeTipos);
		fin("quien-sabe", errorDeTipos, true);
		expect(fin("quien-sabe", errorDeTipos, true).mensaje).toContain("pregúntale a Bruno");
	});

	it("el conteo vive en .claude/estado/, que no entra a git", () => {
		fin("supervisado", errorDeTipos);
		expect(archivoDeEstado).toBe(".claude/estado/intentos.json");
		expect(existsSync(join(raiz, archivoDeEstado))).toBe(true);
		expect(readFileSync(join(raizReal, ".gitignore"), "utf8")).toContain(".claude/estado/");
	});
});

describe("el mismo problema da la misma firma con la salida real de cada herramienta", () => {
	it("una prueba que falla, corrida dos veces con la revisión rápida real, es el mismo problema", {
		timeout: 60_000,
	}, () => {
		const raiz = crearRepositorioDePrueba();
		try {
			escribir(raiz, "scripts/a.ts", "/** Ejemplo. */\nexport const a = (): number => 1;\n");
			escribir(
				raiz,
				"scripts/a.prueba.ts",
				'import { expect, it } from "vitest";\nimport { a } from "./a.ts";\n\nit("da dos", () => {\n\texpect(a()).toBe(2);\n});\n',
			);
			const primera = revisionRapidaCapturada(raiz);
			const segunda = revisionRapidaCapturada(raiz);
			expect(primera.pasa).toBe(false);
			expect(firmaDelProblema(primera.salida)).toBe(firmaDelProblema(segunda.salida));
		} finally {
			borrarRepositorioDePrueba(raiz);
		}
	});

	it("los tiempos y los conteos de Vitest no cambian la firma", () => {
		const una =
			" ❯ scripts/a.prueba.ts (1 test | 1 failed) 7ms\n   × da dos 3ms\n FAIL  scripts/a.prueba.ts > da dos\n✗ Revisión rápida en rojo: Pruebas relacionadas (Vitest).";
		const otra = una.replace("7ms", "12ms").replace("3ms", "5ms");
		expect(firmaDelProblema(una)).toBe(firmaDelProblema(otra));
	});

	it("dos pruebas distintas que fallan son dos problemas", () => {
		const una = " FAIL  scripts/a.prueba.ts > da dos\n✗ Revisión rápida en rojo: Pruebas relacionadas (Vitest).";
		expect(firmaDelProblema(una)).not.toBe(firmaDelProblema(una.replace("da dos", "da tres")));
	});

	it("un estado de intentos dañado no detiene al gancho: empieza de cero", () => {
		const raiz = mkdtempSync(join(tmpdir(), "uniformame-fin-"));
		try {
			escribir(raiz, archivoDeEstado, "{ esto no es json");
			expect(procesarFin(raiz, errorDeTipos, false).mensaje).toContain("intento 1 de 3");
		} finally {
			rmSync(raiz, { recursive: true, force: true });
		}
	});
});
