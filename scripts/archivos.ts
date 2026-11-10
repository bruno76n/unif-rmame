/**
 * Qué archivos se revisan: los que se van a guardar y los que cambiaron.
 * Fase 1 · docs/cimientos/ESTRUCTURA.md («Comandos»)
 *
 * Lo usan el sello, la búsqueda de secretos, la revisión rápida, `docs:revisar`, el gancho de git y
 * las pruebas. Todo sale de git, así que lo que `.gitignore` deja fuera (`node_modules`, `.env`,
 * `.revision/`) nunca se revisa ni entra a la huella.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Corre git y regresa su salida.
 * @param raiz La carpeta del repositorio.
 * @param argumentos Lo que va después de `git`.
 * @param entrada Lo que se le pasa por la entrada estándar, si hace falta.
 */
export function git(raiz: string, argumentos: string[], entrada?: string): string {
	return execFileSync("git", argumentos, {
		cwd: raiz,
		encoding: "utf8",
		input: entrada ?? "",
		maxBuffer: 64 * 1024 * 1024,
		stdio: ["pipe", "pipe", "pipe"],
	});
}

/** Parte una salida de git hecha con `-z` en sus rutas. */
function rutasDe(salida: string): string[] {
	return salida.split("\0").filter((ruta) => ruta !== "");
}

/**
 * Los archivos que quedarían guardados si se agregara todo: los que git ya sigue y los nuevos que
 * `.gitignore` no deja fuera, sin los que se borraron.
 * @param raiz La carpeta del repositorio.
 * @returns Las rutas relativas, ordenadas.
 */
export function archivosDelArbol(raiz: string): string[] {
	const rutas = rutasDe(git(raiz, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]));
	return [...new Set(rutas)].filter((ruta) => existsSync(join(raiz, ruta))).sort();
}

/**
 * Los archivos que cambiaron desde el último commit: los modificados, agregados o nuevos, sin los borrados.
 * @param raiz La carpeta del repositorio.
 * @returns Las rutas relativas, ordenadas. Sin commits todavía, son todos los del árbol.
 */
export function archivosCambiados(raiz: string): string[] {
	let cambiados: string[];
	try {
		git(raiz, ["rev-parse", "--verify", "-q", "HEAD"]);
		cambiados = [
			...rutasDe(git(raiz, ["diff", "-z", "--name-only", "HEAD"])),
			...rutasDe(git(raiz, ["ls-files", "-z", "--others", "--exclude-standard"])),
		];
	} catch {
		return archivosDelArbol(raiz);
	}
	return [...new Set(cambiados)].filter((ruta) => existsSync(join(raiz, ruta))).sort();
}

/**
 * Los archivos que van en el commit que se está haciendo, con los borrados.
 * @param raiz La carpeta del repositorio.
 * @returns Las rutas relativas que cambian en el índice respecto al último commit.
 */
export function archivosDelCommit(raiz: string): string[] {
	return rutasDe(git(raiz, ["diff", "-z", "--cached", "--name-only", "--no-renames"])).sort();
}

/**
 * Los archivos que cambiaron en el árbol de trabajo y no están agregados al índice, con los nuevos.
 * @param raiz La carpeta del repositorio.
 * @returns Las rutas relativas, ordenadas.
 */
export function archivosSinAgregar(raiz: string): string[] {
	const rutas = [
		...rutasDe(git(raiz, ["diff", "-z", "--name-only"])),
		...rutasDe(git(raiz, ["ls-files", "-z", "--others", "--exclude-standard"])),
	];
	return [...new Set(rutas)].sort();
}
