/**
 * La revisión de las migraciones y de las llaves pendientes, un paso de `pnpm revision`.
 * Fase 2 · docs/cimientos/BASE-DE-DATOS.md («Migraciones» y «Llaves que apuntan a una fase posterior»)
 *
 * Falla si cambió o se borró una migración que ya está en la rama principal (una migración aplicada
 * nunca se edita), o si una marca `@llavePendiente <tabla>.<columna>` apunta a una tabla que ya existe
 * (su llave foránea se quedó olvidada). Que las migraciones apliquen desde cero lo prueba
 * `apps/api/src/nucleo/base/migraciones.prueba.ts`, dentro de «Todas las pruebas».
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { archivosDelArbol, git } from "./archivos.ts";

/** Un problema encontrado, con su archivo. */
export interface ProblemaDeMigracion {
	archivo: string;
	que: string;
}

const carpetaDeMigraciones = "apps/api/migraciones/";
const rama = "main";

/**
 * Compara las migraciones de la rama principal con las de ahora.
 * @param raiz La carpeta del repositorio.
 * @returns Las que cambiaron o se borraron; vacío si no hay rama principal todavía.
 */
export function revisarMigracionesDeLaRama(raiz: string): ProblemaDeMigracion[] {
	try {
		git(raiz, ["rev-parse", "--verify", "-q", `refs/heads/${rama}`]);
	} catch {
		return [];
	}
	const enLaRama = git(raiz, ["ls-tree", "-r", "-z", "--name-only", rama, "--", carpetaDeMigraciones])
		.split("\0")
		.filter((ruta) => ruta !== "" && !ruta.includes("/meta/"));
	const ahora = new Set(archivosDelArbol(raiz));
	const problemas: ProblemaDeMigracion[] = [];
	for (const archivo of enLaRama) {
		if (!ahora.has(archivo)) {
			problemas.push({ archivo, que: `se borró una migración que ya está en ${rama}` });
			continue;
		}
		const original = git(raiz, ["rev-parse", `${rama}:${archivo}`]).trim();
		const actual = git(raiz, ["hash-object", archivo]).trim();
		if (original !== actual)
			problemas.push({ archivo, que: `cambió una migración que ya está en ${rama}: va en una nueva` });
	}
	return problemas;
}

/**
 * Busca las marcas `@llavePendiente` que apuntan a una tabla que ya existe.
 * @param raiz La carpeta del repositorio.
 * @returns Una por marca olvidada.
 */
export function revisarLlavesPendientes(raiz: string): ProblemaDeMigracion[] {
	const fuentes = archivosDelArbol(raiz).filter((ruta) => ruta.startsWith("apps/api/src/") && ruta.endsWith(".ts"));
	const textos = fuentes.map((archivo) => ({ archivo, texto: readFileSync(join(raiz, archivo), "utf8") }));
	// Las tablas que existen: cada `pgTable("<nombre>"` de un tablas.ts.
	const tablas = new Set(
		textos
			.filter(({ archivo }) => archivo.endsWith("tablas.ts"))
			.flatMap(({ texto }) => [...texto.matchAll(/pgTable\(\s*["'`]([a-z0-9_]+)["'`]/g)].map((m) => m[1])),
	);
	const problemas: ProblemaDeMigracion[] = [];
	for (const { archivo, texto } of textos) {
		for (const marca of texto.matchAll(/@llavePendiente\s+([a-z0-9_]+)\.([a-z0-9_]+)/g)) {
			if (tablas.has(marca[1])) {
				problemas.push({
					archivo,
					que: `@llavePendiente ${marca[1]}.${marca[2]}: la tabla ${marca[1]} ya existe; agrega la llave foránea en su migración y quita la marca`,
				});
			}
		}
	}
	return problemas;
}

if (import.meta.main) {
	const raiz = process.cwd();
	const problemas = [...revisarMigracionesDeLaRama(raiz), ...revisarLlavesPendientes(raiz)];
	for (const { archivo, que } of problemas) console.error(`${archivo} · ${que}`);
	console.log(problemas.length === 0 ? "Migraciones: en verde." : `Migraciones: ${problemas.length} problemas.`);
	process.exit(problemas.length === 0 ? 0 : 1);
}
