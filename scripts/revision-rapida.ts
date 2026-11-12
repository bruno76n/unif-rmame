/**
 * La revisión rápida: `pnpm revision:rapida`.
 * Fase 1 · docs/cimientos/ESTRUCTURA.md («Comandos») y docs/trabajo/FORMA-DE-TRABAJO.md («Los verdes»)
 *
 * Revisa solo lo que cambió desde el último commit: Biome sobre esos archivos, los tipos si cambió
 * código o la configuración de TypeScript, y las pruebas relacionadas con lo cambiado. La corren los
 * ganchos de Claude Code después de cada edición y al terminar cada turno.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { archivosCambiados } from "./archivos.ts";
import { correr } from "./comandos.ts";

/** Lo que revisa Biome; los `.md` los revisa `pnpm docs:revisar`. */
const deBiome = /\.(ts|tsx|js|mjs|cjs|json|jsonc)$/;
/** Lo que pide revisar los tipos. */
const deTipos = /(\.tsx?$)|(^|\/)tsconfig[^/]*\.json$/;
/** Lo que puede tener pruebas relacionadas. */
const deCodigo = /\.tsx?$/;

/**
 * Corre la revisión rápida sobre lo cambiado.
 * @param raiz La carpeta del repositorio.
 * @returns `true` si todo lo cambiado sale en verde (o si no cambió nada que revisar).
 */
export function correrRevisionRapida(raiz: string): boolean {
	const cambiados = archivosCambiados(raiz);
	const paraBiome = cambiados.filter((ruta) => deBiome.test(ruta));
	const paraTipos = cambiados.filter((ruta) => deTipos.test(ruta));
	const paraPruebas = cambiados.filter((ruta) => deCodigo.test(ruta));
	if (paraBiome.length === 0 && paraTipos.length === 0) {
		console.log("Revisión rápida: nada de código cambió.");
		return true;
	}
	const pasos: [string, () => boolean][] = [
		[
			"Estilo (Biome)",
			() => paraBiome.length === 0 || correr(raiz, "biome", ["check", "--no-errors-on-unmatched", ...paraBiome]),
		],
		[
			"Tipos (tsc)",
			() =>
				paraTipos.length === 0 ||
				(correr(raiz, "tsc", ["-p", "tsconfig.json"]) &&
					// Las pantallas y el sistema de diseño, si el repositorio ya los tiene.
					(!existsSync(join(raiz, "tsconfig.web.json")) || correr(raiz, "tsc", ["-p", "tsconfig.web.json"]))),
		],
		[
			"Pruebas relacionadas (Vitest)",
			() =>
				paraPruebas.length === 0 || correr(raiz, "vitest", ["related", "--run", "--passWithNoTests", ...paraPruebas]),
		],
	];
	for (const [nombre, paso] of pasos) {
		if (!paso()) {
			console.error(`✗ Revisión rápida en rojo: ${nombre}.`);
			return false;
		}
	}
	console.log(`✓ Revisión rápida en verde (${cambiados.length} archivos cambiados).`);
	return true;
}

if (import.meta.main) {
	process.exit(correrRevisionRapida(process.cwd()) ? 0 : 1);
}
