/**
 * El sello de la revisión completa: la huella exacta de lo revisado.
 * Fase 1 · docs/cimientos/ESTRUCTURA.md («Comandos», el sello) y docs/trabajo/FORMA-DE-TRABAJO.md («Los verdes»)
 *
 * La huella es un SHA-256 de cada ruta con el hash de git de su contenido, sin `docs/registros/`:
 * los registros se escriben después de la revisión y no deben invalidarla. Se calcula igual sobre el
 * árbol de trabajo (al revisar) y sobre el índice (al hacer el commit), así que el gancho de git puede
 * comprobar que se guarda exactamente lo que se revisó.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { archivosDelArbol, git } from "./archivos.ts";

/** Lo que la huella no incluye: los registros (ver docs/trabajo/FORMA-DE-TRABAJO.md, «Los registros»). */
export const carpetaDeRegistros = "docs/registros/";

/** Donde vive el sello; `.gitignore` lo deja fuera de git. */
const archivoDelSello = ".revision/sello.json";

/**
 * Dice si una ruta cuenta para la huella.
 * @param ruta La ruta relativa a la raíz.
 * @returns `false` para los registros.
 */
export function cuentaParaLaHuella(ruta: string): boolean {
	return !ruta.startsWith(carpetaDeRegistros);
}

/**
 * Calcula la huella de una lista de rutas con el hash de git de su contenido.
 * @param pares Cada ruta con su hash de git.
 * @returns El SHA-256 en hexadecimal, que no depende del orden de la lista.
 */
function huellaDe(pares: [string, string][]): string {
	const hash = createHash("sha256");
	for (const [ruta, contenido] of [...pares].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
		hash.update(`${ruta}\0${contenido}\n`);
	}
	return hash.digest("hex");
}

/**
 * La huella del árbol de trabajo: lo que se guardaría si se agregara todo.
 * @param raiz La carpeta del repositorio.
 * @returns La huella, sin los registros.
 */
export function huellaDelArbol(raiz: string): string {
	const rutas = archivosDelArbol(raiz).filter(cuentaParaLaHuella);
	if (rutas.length === 0) return huellaDe([]);
	// `git hash-object` da el mismo hash que guardará el índice para ese contenido.
	const hashes = git(raiz, ["hash-object", "--stdin-paths"], `${rutas.join("\n")}\n`)
		.trim()
		.split("\n");
	return huellaDe(rutas.map((ruta, i) => [ruta, hashes[i] ?? ""]));
}

/**
 * La huella del índice: exactamente lo que va a guardar el commit.
 * @param raiz La carpeta del repositorio.
 * @returns La huella, sin los registros.
 */
export function huellaDelIndice(raiz: string): string {
	const pares: [string, string][] = [];
	// Cada renglón de `ls-files -s` es «modo hash etapa\truta».
	for (const renglon of git(raiz, ["ls-files", "-s", "-z"]).split("\0")) {
		const [datos, ruta] = renglon.split("\t");
		const hash = datos?.split(" ")[1];
		if (ruta && hash && cuentaParaLaHuella(ruta)) pares.push([ruta, hash]);
	}
	return huellaDe(pares);
}

/**
 * Guarda el sello de una revisión completa en verde.
 * @param raiz La carpeta del repositorio.
 * @param huella La huella de lo que se revisó.
 */
export function guardarSello(raiz: string, huella: string): void {
	mkdirSync(join(raiz, ".revision"), { recursive: true });
	writeFileSync(
		join(raiz, archivoDelSello),
		`${JSON.stringify({ huella, sellado_en: new Date().toISOString() }, null, "\t")}\n`,
	);
}

/**
 * Lee la huella del último sello.
 * @param raiz La carpeta del repositorio.
 * @returns La huella, o `undefined` si nunca se ha sellado.
 */
export function leerSello(raiz: string): string | undefined {
	if (!existsSync(join(raiz, archivoDelSello))) return undefined;
	const sello: unknown = JSON.parse(readFileSync(join(raiz, archivoDelSello), "utf8"));
	return typeof sello === "object" && sello !== null && "huella" in sello && typeof sello.huella === "string"
		? sello.huella
		: undefined;
}
