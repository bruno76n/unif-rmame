/**
 * Prueba de `pnpm docs:revisar`.
 * Fase 1 · docs/fases/01-repositorio-reglas-y-paquete-compartido.md (parte 3)
 *
 * Arma un juego chico de archivos de creación bien escritos en un repositorio temporal y, sobre él,
 * mete un error de cada tipo para ver que la revisión lo encuentra.
 */

import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ErrorDeDocumento, revisarDocumentos } from "./docs-revisar.ts";
import { borrarRepositorioDePrueba, crearRepositorioDePrueba, escribir } from "./repositorio-de-prueba.ts";

/** Arma un encabezado de cuatro líneas. */
function encabezado(titulo: string, construye: string, conecta: string): string {
	return `# ${titulo}\n\n> **Qué cubre:** ${titulo.toLowerCase()}.\n> **Estado:** Decidido.\n> **Se construye en:** ${construye}.\n> **Se conecta con:** ${conecta}\n`;
}

/** Un juego de archivos bien escritos: el índice, dos temas conectados entre sí, una fase y un agente. */
function escribirDocumentosBuenos(raiz: string): void {
	escribir(
		raiz,
		"docs/INDICE.md",
		`${encabezado("Índice", "[fase 1](fases/01-uno.md)", "[tema a](a.md) · [fase 1](fases/01-uno.md)")}
- [Índice](INDICE.md) — todo.
- [Tema a](a.md) — a.
- [Tema b](b.md) — b.
- [Fase 1](fases/01-uno.md) — la fase.
- [AGENTS.md](../AGENTS.md) — los agentes.
- [Auditor](../.claude/agents/auditor.md) — el auditor.
`,
	);
	escribir(
		raiz,
		"docs/a.md",
		`${encabezado("Tema a", "[fase 1](fases/01-uno.md)", "[índice](INDICE.md) · [tema b](b.md)")}
## Cómo se hace

Ver [b, sus reglas](b.md#reglas-del-tema-b) y [abajo](#cómo-se-hace).

\`\`\`text
[esto no es un enlace](no-existe.md)
\`\`\`
`,
	);
	escribir(
		raiz,
		"docs/b.md",
		`${encabezado("Tema b", "[fase 1](fases/01-uno.md)", "[tema a](a.md)")}
## Reglas del tema \`b\`

Nada más.
`,
	);
	escribir(
		raiz,
		"docs/fases/01-uno.md",
		`# Fase 01: Uno

> **Etapa:** Cimientos.
> **Estado:** Pendiente.
> **Antes de empezar:** lee el [tema a](../a.md).
> **Se conecta con:** [índice](../INDICE.md)
`,
	);
	escribir(raiz, "AGENTS.md", encabezado("Agentes", "[fase 1](docs/fases/01-uno.md)", ""));
	escribir(
		raiz,
		".claude/agents/auditor.md",
		`---
name: auditor
---

${encabezado("Auditor", "[fase 1](../../docs/fases/01-uno.md)", "")}`,
	);
	escribir(raiz, "docs/registros/sesiones/2026-11-10-fase-01.md", "Sin encabezado y con [un enlace roto](nada.md).\n");
}

/** Los tipos de error que encontró la revisión. */
function tipos(errores: ErrorDeDocumento[]): string[] {
	return [...new Set(errores.map((e) => e.tipo))];
}

describe("pnpm docs:revisar encuentra un encabezado incompleto, un enlace roto, un ancla que no existe, una conexión de un solo lado y un archivo fuera del índice", () => {
	let raiz = "";
	beforeEach(() => {
		raiz = crearRepositorioDePrueba();
		escribirDocumentosBuenos(raiz);
	});
	afterEach(() => borrarRepositorioDePrueba(raiz));

	it("los archivos bien escritos salen en verde, sin revisar las sesiones", () => {
		expect(revisarDocumentos(raiz)).toEqual([]);
	});

	it("encuentra un encabezado incompleto", () => {
		escribir(
			raiz,
			"docs/b.md",
			"# Tema b\n\n> **Qué cubre:** b.\n> **Se construye en:** [fase 1](fases/01-uno.md).\n> **Se conecta con:** [tema a](a.md)\n\n## Reglas del tema `b`\n",
		);
		const errores = revisarDocumentos(raiz);
		expect(tipos(errores)).toEqual(["encabezado"]);
		expect(errores[0]?.archivo).toBe("docs/b.md");
	});

	it("encuentra un estado que no es de la lista", () => {
		escribir(
			raiz,
			"docs/fases/01-uno.md",
			"# Fase 01: Uno\n\n> **Etapa:** Cimientos.\n> **Estado:** Quizás.\n> **Antes de empezar:** nada.\n> **Se conecta con:** [índice](../INDICE.md)\n",
		);
		expect(tipos(revisarDocumentos(raiz))).toEqual(["encabezado"]);
	});

	it("encuentra un enlace roto", () => {
		escribir(
			raiz,
			"docs/b.md",
			`${encabezado("Tema b", "[fase 1](fases/01-uno.md)", "[tema a](a.md)")}\nVer [c](c.md).\n\n## Reglas del tema \`b\`\n`,
		);
		const errores = revisarDocumentos(raiz);
		expect(tipos(errores)).toEqual(["enlace"]);
		expect(errores[0]).toMatchObject({ archivo: "docs/b.md", renglon: 8 });
	});

	it("encuentra un ancla que no existe", () => {
		escribir(
			raiz,
			"docs/b.md",
			`${encabezado("Tema b", "[fase 1](fases/01-uno.md)", "[tema a](a.md)")}\nVer [a](a.md#no-existe).\n\n## Reglas del tema \`b\`\n`,
		);
		expect(tipos(revisarDocumentos(raiz))).toEqual(["ancla"]);
	});

	it("encuentra una conexión de un solo lado", () => {
		escribir(
			raiz,
			"docs/b.md",
			`${encabezado("Tema b", "[fase 1](fases/01-uno.md)", "[tema a](a.md) · [índice](INDICE.md)")}\n## Reglas del tema \`b\`\n`,
		);
		const errores = revisarDocumentos(raiz);
		expect(tipos(errores)).toEqual(["conexion"]);
		expect(errores[0]?.que).toContain("docs/INDICE.md");
	});

	it("encuentra un archivo fuera del índice", () => {
		escribir(raiz, "docs/c.md", encabezado("Tema c", "[fase 1](fases/01-uno.md)", ""));
		const errores = revisarDocumentos(raiz);
		expect(tipos(errores)).toEqual(["indice"]);
		expect(errores[0]?.archivo).toBe("docs/c.md");
	});

	it("revisa también los archivos de .claude/", () => {
		rmSync(join(raiz, ".claude/agents/auditor.md"));
		escribir(raiz, ".claude/agents/auditor.md", "---\nname: auditor\n---\n\n# Auditor\n");
		expect(tipos(revisarDocumentos(raiz))).toEqual(["encabezado"]);
	});
});
