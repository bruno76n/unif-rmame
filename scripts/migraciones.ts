/**
 * La revisión de las migraciones y de las llaves pendientes, un paso de `pnpm revision`.
 * Fase 2 · docs/cimientos/BASE-DE-DATOS.md («Migraciones» y «Llaves que apuntan a una fase posterior»)
 *
 * Falla si cambió o se borró una migración que ya está en la rama principal (la del remoto o la local),
 * si cambió una entrada de su registro (`meta/_journal.json`), si no hay rama principal con qué
 * comparar (una migración aplicada nunca se edita), o si una marca `@llavePendiente <tabla>.<columna>` apunta a una tabla que ya existe
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
const registroDeMigraciones = `${carpetaDeMigraciones}meta/_journal.json`;
/** Las ramas principales contra las que se compara: la del remoto y la local, las que existan. */
const ramasPrincipales = ["refs/remotes/origin/main", "refs/heads/main"];

/** Las ramas principales que existen en este repositorio. */
function ramasQueExisten(raiz: string): string[] {
	return ramasPrincipales.filter((rama) => {
		try {
			git(raiz, ["rev-parse", "--verify", "-q", rama]);
			return true;
		} catch {
			return false;
		}
	});
}

/** La fecha (`when`) de una entrada del registro, ya como texto JSON. */
function cuandoDe(entrada: string): number {
	const leida: unknown = JSON.parse(entrada);
	return typeof leida === "object" && leida !== null && "when" in leida && typeof leida.when === "number"
		? leida.when
		: 0;
}

/** Las entradas del registro de drizzle-kit (`meta/_journal.json`), como texto para compararlas. */
function entradasDelRegistro(texto: string): string[] {
	try {
		const leido: unknown = JSON.parse(texto);
		if (typeof leido !== "object" || leido === null || !("entries" in leido) || !Array.isArray(leido.entries))
			return [];
		return leido.entries.map((entrada: unknown) => JSON.stringify(entrada));
	} catch {
		return [];
	}
}

/**
 * Compara las migraciones de la rama principal (la del remoto y la local) con las de ahora.
 * @param raiz La carpeta del repositorio.
 * @returns Las que cambiaron o se borraron, las entradas del registro que cambiaron, o un problema si
 * no hay ninguna rama principal con qué comparar (en un clon de una sola rama: `git fetch origin main`).
 */
export function revisarMigracionesDeLaRama(raiz: string): ProblemaDeMigracion[] {
	const ramas = ramasQueExisten(raiz);
	if (ramas.length === 0) {
		return [
			{ archivo: carpetaDeMigraciones, que: "no hay rama principal con qué comparar: corre git fetch origin main" },
		];
	}
	const ahora = new Set(archivosDelArbol(raiz));
	const problemas = new Map<string, ProblemaDeMigracion>();
	for (const rama of ramas) {
		const enLaRama = git(raiz, ["ls-tree", "-r", "-z", "--name-only", rama, "--", carpetaDeMigraciones])
			.split("\0")
			.filter((ruta) => ruta !== "" && !ruta.includes("/meta/"));
		for (const archivo of enLaRama) {
			if (!ahora.has(archivo)) {
				problemas.set(archivo, {
					archivo,
					que: "una migración de la rama principal no está aquí: se borró, o esta rama no está al día con main",
				});
				continue;
			}
			const original = git(raiz, ["rev-parse", `${rama}:${archivo}`]).trim();
			const actual = git(raiz, ["hash-object", archivo]).trim();
			if (original !== actual) {
				problemas.set(archivo, {
					archivo,
					que: "cambió una migración que ya está en la rama principal: va en una nueva",
				});
			}
		}
		// El registro de drizzle-kit solo puede crecer: sus entradas de la rama principal siguen iguales.
		let registroDeLaRama = "";
		try {
			registroDeLaRama = git(raiz, ["show", `${rama}:${registroDeMigraciones}`]);
		} catch {
			continue;
		}
		const actuales = ahora.has(registroDeMigraciones)
			? entradasDelRegistro(readFileSync(join(raiz, registroDeMigraciones), "utf8"))
			: [];
		const deLaRama = entradasDelRegistro(registroDeLaRama);
		// Drizzle aplica en orden de `when` y se salta una entrada nueva con fecha anterior a la última aplicada.
		const ultimaDeLaRama = Math.max(0, ...deLaRama.map(cuandoDe));
		if (actuales.slice(deLaRama.length).some((entrada) => cuandoDe(entrada) <= ultimaDeLaRama)) {
			problemas.set(`${registroDeMigraciones}#orden`, {
				archivo: registroDeMigraciones,
				que: "una migración nueva tiene fecha anterior a la última de la rama principal: Drizzle se la saltaría; genérala otra vez",
			});
		}
		if (deLaRama.some((entrada, i) => actuales[i] !== entrada)) {
			problemas.set(registroDeMigraciones, {
				archivo: registroDeMigraciones,
				que: "cambió una entrada del registro de migraciones que ya está en la rama principal",
			});
		}
	}
	return [...problemas.values()];
}

/**
 * Busca las marcas `@llavePendiente` que apuntan a una tabla que ya existe.
 * @param raiz La carpeta del repositorio.
 * @returns Una por marca olvidada.
 */
export function revisarLlavesPendientes(raiz: string): ProblemaDeMigracion[] {
	const archivos = archivosDelArbol(raiz);
	const leer = (archivo: string) => ({ archivo, texto: readFileSync(join(raiz, archivo), "utf8") });
	const textos = archivos.filter((ruta) => ruta.startsWith("apps/api/src/") && ruta.endsWith(".ts")).map(leer);
	const migraciones = archivos
		.filter((ruta) => ruta.startsWith(carpetaDeMigraciones) && ruta.endsWith(".sql"))
		.map(leer);
	// Las tablas que existen: cada `pgTable("<nombre>"` de un tablas.ts y cada `CREATE TABLE` de una migración.
	const tablas = new Set([
		...textos
			.filter(({ archivo }) => archivo.endsWith("tablas.ts"))
			.flatMap(({ texto }) => [...texto.matchAll(/pgTable\(\s*["'`]([a-z0-9_]+)["'`]/g)].map((m) => m[1])),
		...migraciones.flatMap(({ texto }) =>
			[
				...texto.matchAll(
					/CREATE\s+(?:UNLOGGED\s+|TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?public"?\s*\.\s*)?(?:"([^"]+)"|([A-Za-z0-9_]+))/gi,
				),
			].map((m) => m[1] ?? (m[2] ?? "").toLowerCase()),
		),
	]);
	const problemas: ProblemaDeMigracion[] = [];
	for (const { archivo, texto } of textos) {
		for (const marca of texto.matchAll(/@llavePendiente\s+([A-Za-z0-9_]+)(?:\.([A-Za-z0-9_]+))?/g)) {
			const tabla = (marca[1] ?? "").toLowerCase();
			if (tablas.has(tabla)) {
				problemas.push({
					archivo,
					que: `@llavePendiente ${marca[1]}${marca[2] ? `.${marca[2]}` : ""}: la tabla ${tabla} ya existe; agrega la llave foránea en su migración y quita la marca`,
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
