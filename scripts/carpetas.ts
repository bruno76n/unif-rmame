/**
 * Las carpetas de cada trabajador de las fases 19 y 21: con su encargo (`.trabajador.json`, que no entra a git), revisa
 * que todo lo que cambió desde que salió de la rama de la fase esté en sus carpetas. Si tocó otra, su trabajo no entra.
 * Fase 19 · docs/trabajo/FORMA-DE-TRABAJO.md («Trabajo en paralelo», regla 3), docs/fases/19-web-principal.md
 * («Cómo se construye») y docs/fases/21-pruebas-de-punta-a-punta.md («Cómo se construye»)
 *
 * Un departamento es dueño de su ruta y su carpeta en la web, de las consultas y los contratos de sus módulos (y su
 * registro en el `index.ts` del módulo), de su archivo de pantallas y de los archivos que se generan solos (el árbol
 * de rutas y `openapi.json`). Un flujo de la fase 21 es dueño de su archivo de prueba en `pruebas/flujos/` y de su
 * archivo de flujo. Lo demás que el capataz le dé va en `tambien`.
 * Uso: `node scripts/carpetas.ts` en el worktree del trabajador.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { git } from "./archivos.ts";

/** El nombre del archivo del encargo, en la raíz del worktree. */
export const archivoDelEncargo = ".trabajador.json";

/** Por departamento: sus módulos y su archivo de pantallas. */
const departamentos: Readonly<Record<string, { modulos: readonly string[]; pantallas: string }>> = {
	direccion: { modulos: ["direccion"], pantallas: "direccion" },
	compras: { modulos: ["compras"], pantallas: "compras" },
	catalogo: { modulos: ["catalogo"], pantallas: "catalogo" },
	patronaje: { modulos: ["patronaje"], pantallas: "patronaje" },
	ventas: { modulos: ["ventas"], pantallas: "ventas" },
	linea: { modulos: ["linea"], pantallas: "tienda-en-linea" },
	produccion: { modulos: ["produccion"], pantallas: "produccion" },
	calidad: { modulos: ["calidad"], pantallas: "calidad" },
	mantenimiento: { modulos: ["mantenimiento"], pantallas: "mantenimiento" },
	aduana: { modulos: ["inventario"], pantallas: "aduana" },
	bodega: { modulos: ["inventario"], pantallas: "bodega" },
	contaduria: { modulos: ["contaduria"], pantallas: "contaduria" },
	personal: { modulos: ["personal"], pantallas: "personal" },
	admin: { modulos: ["admin"], pantallas: "administracion" },
};

/** El encargo de un trabajador: un departamento (fase 19) o un flujo (fase 21, `04-compra-de-material`). */
export type Encargo = {
	/** El commit de la rama de la fase del que salió su worktree. */
	desde: string;
	/** Otras rutas que el capataz le dio (una consulta en el módulo de otro, por ejemplo). */
	tambien?: readonly string[];
} & ({ departamento: string } | { flujo: string });

/** Cómo se llama un flujo: su número y su nombre (`04-compra-de-material`). */
const nombreDeFlujo = /^\d{2}-[a-z-]+$/;

/**
 * El nombre del encargo, para lo que dice el script.
 * @param encargo El encargo.
 */
function nombreDelEncargo(encargo: Encargo): string {
	return "flujo" in encargo ? `el flujo ${encargo.flujo}` : encargo.departamento;
}

/**
 * Las carpetas y los archivos de un encargo; una ruta que termina en «/» es una carpeta.
 * @param encargo El encargo.
 * @throws Si el departamento o el flujo no existe.
 */
export function carpetasDe(encargo: Encargo): string[] {
	if ("flujo" in encargo) {
		if (!nombreDeFlujo.test(encargo.flujo)) throw new Error(`no existe el flujo ${encargo.flujo}`);
		return [
			`pruebas/flujos/${encargo.flujo}.prueba.ts`,
			`docs/flujos/fabrica/${encargo.flujo}.md`,
			...(encargo.tambien ?? []),
		];
	}
	const suyo = departamentos[encargo.departamento];
	if (suyo === undefined) throw new Error(`no existe el departamento ${encargo.departamento}`);
	return [
		`apps/web/src/rutas/${encargo.departamento}/`,
		`apps/web/src/departamentos/${encargo.departamento}/`,
		`docs/interfaz/fabrica/${suyo.pantallas}.md`,
		...suyo.modulos.flatMap((modulo) => [
			`apps/api/src/modulos/${modulo}/consultas/`,
			`apps/api/src/modulos/${modulo}/index.ts`,
			`packages/compartido/src/contratos/${modulo}/`,
		]),
		// Los que se generan solos; el capataz los vuelve a generar al juntar.
		"apps/web/src/arbol-de-rutas.gen.ts",
		"apps/api/openapi.json",
		...(encargo.tambien ?? []),
	];
}

/**
 * Lo que cambió el trabajador desde que salió de la rama de la fase: lo de sus commits, lo que no ha guardado y lo
 * nuevo.
 * @param raiz La carpeta del worktree.
 * @param desde El commit del que salió.
 */
export function cambiosDelTrabajador(raiz: string, desde: string): string[] {
	const rutas = [
		...git(raiz, ["diff", "-z", "--name-only", desde]).split("\0"),
		...git(raiz, ["ls-files", "-z", "--others", "--exclude-standard"]).split("\0"),
	];
	return [...new Set(rutas.filter((ruta) => ruta !== ""))].sort();
}

/**
 * Lo que el trabajador tocó fuera de sus carpetas.
 * @param raiz La carpeta del worktree.
 * @param encargo Su encargo.
 * @returns Las rutas de fuera, ordenadas; vacío si todo está en sus carpetas.
 */
export function fueraDeSusCarpetas(raiz: string, encargo: Encargo): string[] {
	const suyas = carpetasDe(encargo);
	return cambiosDelTrabajador(raiz, encargo.desde).filter(
		(ruta) => !suyas.some((carpeta) => (carpeta.endsWith("/") ? ruta.startsWith(carpeta) : ruta === carpeta)),
	);
}

/**
 * Lee el encargo del worktree, si lo hay.
 * @param raiz La carpeta del worktree.
 */
export function leerEncargo(raiz: string): Encargo | undefined {
	const ruta = join(raiz, archivoDelEncargo);
	if (!existsSync(ruta)) return undefined;
	const leido: unknown = JSON.parse(readFileSync(ruta, "utf8"));
	if (typeof leido !== "object" || leido === null || !("desde" in leido) || typeof leido.desde !== "string") {
		throw new Error(`${archivoDelEncargo} necesita «departamento» o «flujo», y «desde»`);
	}
	const tambien =
		"tambien" in leido && Array.isArray(leido.tambien) ? leido.tambien.filter((ruta) => typeof ruta === "string") : [];
	if ("flujo" in leido && typeof leido.flujo === "string") return { flujo: leido.flujo, desde: leido.desde, tambien };
	if ("departamento" in leido && typeof leido.departamento === "string") {
		return { departamento: leido.departamento, desde: leido.desde, tambien };
	}
	throw new Error(`${archivoDelEncargo} necesita «departamento» o «flujo», y «desde»`);
}

/**
 * Revisa las carpetas del trabajador de este worktree y lo dice.
 * @param raiz La carpeta del worktree.
 * @returns Si todo está en sus carpetas (o no hay encargo).
 */
export function revisarCarpetas(raiz: string): boolean {
	const encargo = leerEncargo(raiz);
	if (encargo === undefined) return true;
	const fuera = fueraDeSusCarpetas(raiz, encargo);
	if (fuera.length === 0) {
		console.log(`Carpetas de ${nombreDelEncargo(encargo)}: todo en las suyas.`);
		return true;
	}
	console.error(
		`✗ ${nombreDelEncargo(encargo)} tocó carpetas que no son suyas:\n${fuera.map((ruta) => `  ${ruta}`).join("\n")}`,
	);
	return false;
}

if (import.meta.main) process.exit(revisarCarpetas(process.cwd()) ? 0 : 1);
