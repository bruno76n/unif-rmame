/**
 * Prueba de la revisión rápida.
 * Fase 1 · docs/fases/01-repositorio-reglas-y-paquete-compartido.md (parte 2)
 */

import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarRepositorioDePrueba, crearRepositorioDePrueba, escribir, git } from "./repositorio-de-prueba.ts";

/** Corre `scripts/revision-rapida.ts` en el repositorio temporal y regresa si pasó y lo que dijo. */
function revisionRapida(raiz: string): { pasa: boolean; salida: string } {
	const resultado = spawnSync(process.execPath, ["scripts/revision-rapida.ts"], { cwd: raiz, encoding: "utf8" });
	return { pasa: resultado.status === 0, salida: `${resultado.stdout}${resultado.stderr}` };
}

/** Un archivo de ejemplo bien escrito, con el formato de Biome. */
const archivoBueno = `/** Ejemplo. */
export function sumar(a: number, b: number): number {
\treturn a + b;
}
`;

describe("la revisión rápida falla con un error de tipos, un any o un error de estilo en lo cambiado, y pasa sin ellos", () => {
	let raiz = "";
	beforeAll(() => {
		raiz = crearRepositorioDePrueba();
	});
	afterAll(() => borrarRepositorioDePrueba(raiz));

	/** Deja el repositorio como en el primer commit antes de cada caso. */
	function limpiar(): void {
		git(raiz, ["checkout", "-q", "--", "."]);
		git(raiz, ["clean", "-qfd", "-e", "node_modules"]);
	}

	it("pasa sin cambios", () => {
		limpiar();
		expect(revisionRapida(raiz).pasa).toBe(true);
	});

	it("pasa con un archivo nuevo sin errores", () => {
		limpiar();
		escribir(raiz, "scripts/ejemplo.ts", archivoBueno);
		const { pasa, salida } = revisionRapida(raiz);
		expect(pasa, salida).toBe(true);
	});

	it("falla con un error de tipos", () => {
		limpiar();
		escribir(raiz, "scripts/ejemplo.ts", archivoBueno.replace("return a + b;", 'return a + "b";'));
		const { pasa, salida } = revisionRapida(raiz);
		expect(pasa).toBe(false);
		expect(salida).toContain("TS2322");
	});

	it("falla con un any", () => {
		limpiar();
		escribir(raiz, "scripts/ejemplo.ts", archivoBueno.replace("b: number)", "b: any)"));
		const { pasa, salida } = revisionRapida(raiz);
		expect(pasa).toBe(false);
		expect(salida).toContain("noExplicitAny");
	});

	it("falla con un error de estilo", () => {
		limpiar();
		escribir(raiz, "scripts/ejemplo.ts", archivoBueno.replace("\treturn a + b;", "        return a+b;"));
		const { pasa, salida } = revisionRapida(raiz);
		expect(pasa).toBe(false);
		expect(salida).toMatch(/format/i);
	});

	it("falla si una prueba relacionada con lo cambiado falla", () => {
		limpiar();
		escribir(raiz, "scripts/ejemplo.ts", archivoBueno.replace("return a + b;", "return a - b;"));
		escribir(
			raiz,
			"scripts/ejemplo.prueba.ts",
			`import { expect, it } from "vitest";
import { sumar } from "./ejemplo.ts";

it("suma", () => {
\texpect(sumar(1, 2)).toBe(3);
});
`,
		);
		const { pasa } = revisionRapida(raiz);
		expect(pasa).toBe(false);
	});
});
