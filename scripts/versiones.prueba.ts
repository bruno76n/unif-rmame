/**
 * Prueba de las versiones fijas del monorepo.
 * Fase 1 · docs/fases/01-repositorio-reglas-y-paquete-compartido.md (parte 1)
 *
 * Compara lo que instala `pnpm install` y lo que pide el script del entorno de la nube
 * contra la tabla del stack de docs/cimientos/ARQUITECTURA.md, que es la única fuente de las versiones.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const raiz = join(import.meta.dirname, "..");

/** Una herramienta del stack con su versión exacta. */
interface HerramientaDelStack {
	/** El nombre como lo escribe la tabla, en minúsculas y sin comillas invertidas. */
	nombre: string;
	version: string;
}

/**
 * Lee las tablas de «El stack» de ARQUITECTURA.md.
 * @returns Cada herramienta con su versión. Una celda con «A · B» y «1 · 2» da A=1 y B=2;
 * con una sola versión, todas las herramientas de la celda la comparten.
 * Existe porque la tabla es la única fuente de las versiones: la prueba no copia ninguna.
 */
function leerTablaDelStack(): HerramientaDelStack[] {
	const texto = readFileSync(join(raiz, "docs/cimientos/ARQUITECTURA.md"), "utf8");
	const inicio = texto.indexOf("## El stack");
	const fin = texto.indexOf("\n## ", inicio + 1);
	const seccion = texto.slice(inicio, fin);
	const herramientas: HerramientaDelStack[] = [];
	for (const renglon of seccion.split("\n")) {
		// Solo los renglones de datos: cuatro celdas y una versión que empieza con número.
		const celdas = renglon.split("|").map((celda) => celda.trim());
		if (celdas.length !== 6) continue;
		const nombres = (celdas[2] ?? "").split(" · ");
		const versiones = (celdas[3] ?? "").split(" · ");
		if (!/^\d/.test(versiones[0] ?? "")) continue;
		nombres.forEach((nombre, i) => {
			const version = versiones.length === nombres.length ? versiones[i] : versiones[0];
			herramientas.push({ nombre: nombre.replaceAll("`", "").toLowerCase(), version: version ?? "" });
		});
	}
	return herramientas;
}

/**
 * Busca la versión que la tabla del stack da a un paquete de npm.
 * @param paquete El nombre del paquete, como `@biomejs/biome`.
 * @returns La versión, o `undefined` si el paquete no está en la tabla.
 * Primero busca el nombre completo; si ninguna herramienta lo menciona, busca su último pedazo
 * (`biome` de `@biomejs/biome`), para que «Biome» de la tabla cuente como `@biomejs/biome`.
 */
function versionEnElStack(stack: HerramientaDelStack[], paquete: string): string | undefined {
	const completo = stack.find((h) => h.nombre.includes(paquete));
	if (completo) return completo.version;
	const pedazo = paquete.split("/").at(-1) ?? paquete;
	return stack.find((h) => new RegExp(`(^|[^a-z0-9@/-])${pedazo}($|[^a-z0-9/-])`).test(h.nombre))?.version;
}

/** Los `package.json` del monorepo: la raíz y cada carpeta de `apps/` y `packages/`. */
function leerPaquetes(): { ruta: string; contenido: Record<string, unknown> }[] {
	const rutas = ["package.json"];
	for (const carpeta of ["apps", "packages"]) {
		if (!existsSync(join(raiz, carpeta))) continue;
		for (const nombre of readdirSync(join(raiz, carpeta))) {
			const ruta = join(carpeta, nombre, "package.json");
			if (existsSync(join(raiz, ruta))) rutas.push(ruta);
		}
	}
	return rutas.map((ruta) => ({ ruta, contenido: JSON.parse(readFileSync(join(raiz, ruta), "utf8")) }));
}

/**
 * Los pares de texto de un objeto leído de JSON.
 * @param valor Lo leído.
 * @returns Sus pares cuyo valor es texto; cualquier otra cosa da una lista vacía.
 */
function textosDe(valor: unknown): [string, string][] {
	if (typeof valor !== "object" || valor === null) return [];
	return Object.entries(valor).filter((par): par is [string, string] => typeof par[1] === "string");
}

/** Las dependencias de un `package.json`, de todas sus listas, con lo que piden. */
function dependenciasDe(contenido: Record<string, unknown>): [string, string][] {
	const listas = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
	return listas.flatMap((lista) => textosDe(contenido[lista]));
}

/**
 * Lee las versiones que quedaron instaladas para las dependencias directas de cada proyecto.
 * @returns Por proyecto del lockfile (`.`, `packages/compartido`), cada paquete con su versión instalada.
 * El lockfile es YAML; se lee por renglones porque solo hacen falta tres niveles de `importers:`.
 */
function leerInstaladas(): Map<string, Map<string, string>> {
	const texto = readFileSync(join(raiz, "pnpm-lock.yaml"), "utf8");
	const instaladas = new Map<string, Map<string, string>>();
	let enImporters = false;
	let proyecto = "";
	let paquete = "";
	for (const renglon of texto.split("\n")) {
		if (/^\S/.test(renglon)) enImporters = renglon.startsWith("importers:");
		if (!enImporters) continue;
		const nivel = renglon.length - renglon.trimStart().length;
		const limpio = renglon
			.trim()
			.replace(/^'|'?:$/g, "")
			.replace(/'$/, "");
		// El lockfile de pnpm 12 trae dos documentos con `importers:`: el de pnpm mismo y el del monorepo.
		if (nivel === 2) {
			proyecto = limpio;
			if (!instaladas.has(proyecto)) instaladas.set(proyecto, new Map());
		} else if (nivel === 6) {
			paquete = limpio;
		} else if (nivel === 8 && renglon.trim().startsWith("version:")) {
			const version = renglon.trim().slice("version:".length).trim().split("(")[0] ?? "";
			instaladas.get(proyecto)?.set(paquete, version);
		}
	}
	return instaladas;
}

/** Lee una variable `NOMBRE=valor` del script del entorno de la nube, en FORMA-DE-TRABAJO.md. */
function variableDelScriptDelEntorno(nombre: string): string | undefined {
	const texto = readFileSync(join(raiz, "docs/trabajo/FORMA-DE-TRABAJO.md"), "utf8");
	const script = texto.slice(texto.indexOf("### El entorno de la nube"));
	return new RegExp(`^${nombre}=(\\S+)$`, "m").exec(script)?.[1];
}

describe("pnpm install instala exactamente las versiones de la arquitectura y ninguna lleva rango", () => {
	const stack = leerTablaDelStack();
	const paquetes = leerPaquetes();

	it("la tabla del stack trae Node y pnpm", () => {
		expect(versionEnElStack(stack, "node.js")).toMatch(/^\d+\.\d+\.\d+$/);
		expect(versionEnElStack(stack, "pnpm")).toMatch(/^\d+\.\d+\.\d+$/);
	});

	it.each(paquetes.map((p) => [p.ruta, p.contenido] as const))(
		"%s: cada dependencia es exacta y es la del stack",
		(_ruta, contenido) => {
			for (const [nombre, pedida] of dependenciasDe(contenido)) {
				if (pedida.startsWith("workspace:")) continue;
				expect(pedida, `${nombre} no puede llevar rango`).toMatch(/^\d+\.\d+\.\d+$/);
				expect(pedida, `${nombre} debe ser la versión de ARQUITECTURA.md`).toBe(versionEnElStack(stack, nombre));
			}
		},
	);

	it("el lockfile instala justo lo pedido en cada proyecto", () => {
		const instaladas = leerInstaladas();
		for (const { ruta, contenido } of paquetes) {
			const proyecto = ruta === "package.json" ? "." : ruta.replace(/\/package\.json$/, "");
			for (const [nombre, pedida] of dependenciasDe(contenido)) {
				if (pedida.startsWith("workspace:")) continue;
				expect(instaladas.get(proyecto)?.get(nombre), `${proyecto} · ${nombre}`).toBe(pedida);
			}
		}
	});

	it("el lockfile fija pnpm con la versión del stack", () => {
		expect(leerInstaladas().get(".")?.get("pnpm")).toBe(versionEnElStack(stack, "pnpm"));
	});

	it("el package.json raíz fija pnpm y Node con las versiones del stack", () => {
		const raizPaquete = paquetes[0]?.contenido ?? {};
		expect(raizPaquete.packageManager).toBe(`pnpm@${versionEnElStack(stack, "pnpm")}`);
		expect(Object.fromEntries(textosDe(raizPaquete.engines)).node).toBe(versionEnElStack(stack, "node.js"));
	});
});

describe("el script del entorno de la nube pide las mismas versiones de Node y pnpm", () => {
	const stack = leerTablaDelStack();

	it("NODE_VERSION es la de Node.js en el stack", () => {
		expect(variableDelScriptDelEntorno("NODE_VERSION")).toBe(versionEnElStack(stack, "node.js"));
	});

	it("PNPM_VERSION es la de pnpm en el stack", () => {
		expect(variableDelScriptDelEntorno("PNPM_VERSION")).toBe(versionEnElStack(stack, "pnpm"));
	});
});
