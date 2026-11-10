/**
 * Repositorios temporales para las pruebas de los scripts.
 * Fase 1 · docs/fases/01-repositorio-reglas-y-paquete-compartido.md («Cómo se construye»)
 *
 * Cada script de `scripts/` se prueba en un repositorio de git en una carpeta temporal, con la
 * misma configuración que el real: así se demuestra que una revisión o un gancho rechaza lo que
 * debe rechazar sin tocar el repositorio de Unifórmame.
 */

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** La raíz del repositorio de Unifórmame, de donde se copia la configuración. */
export const raizReal = join(import.meta.dirname, "..");

/** Lo que se copia del repositorio real: la configuración, los scripts sin sus pruebas y los ganchos. */
const archivosDeConfiguracion = [
	"package.json",
	"biome.json",
	"tsconfig.base.json",
	"tsconfig.json",
	"vitest.config.ts",
	".gitignore",
	".env.ejemplo",
];

/**
 * Corre git en un repositorio.
 * @param raiz La carpeta del repositorio.
 * @param argumentos Lo que va después de `git`.
 * @returns Lo que git escribió en la salida.
 */
export function git(raiz: string, argumentos: string[]): string {
	return execFileSync("git", argumentos, { cwd: raiz, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/**
 * Escribe un archivo dentro del repositorio temporal, creando sus carpetas.
 * @param raiz La carpeta del repositorio.
 * @param ruta La ruta relativa del archivo.
 * @param contenido Lo que lleva.
 */
export function escribir(raiz: string, ruta: string, contenido: string): void {
	mkdirSync(dirname(join(raiz, ruta)), { recursive: true });
	writeFileSync(join(raiz, ruta), contenido);
}

/**
 * Crea un repositorio de git en una carpeta temporal con la configuración y los scripts del real,
 * `node_modules` enlazado al del real y un primer commit.
 * @returns La carpeta del repositorio. Se borra con {@link borrarRepositorioDePrueba}.
 * El primer commit se hace sin ganchos: todavía no hay `core.hooksPath`.
 */
export function crearRepositorioDePrueba(): string {
	const raiz = mkdtempSync(join(tmpdir(), "uniformame-prueba-"));
	for (const archivo of archivosDeConfiguracion) {
		if (existsSync(join(raizReal, archivo))) cpSync(join(raizReal, archivo), join(raiz, archivo));
	}
	cpSync(join(raizReal, "scripts"), join(raiz, "scripts"), {
		recursive: true,
		filter: (origen) => !origen.endsWith(".prueba.ts"),
	});
	if (existsSync(join(raizReal, ".githooks")))
		cpSync(join(raizReal, ".githooks"), join(raiz, ".githooks"), { recursive: true });
	symlinkSync(join(raizReal, "node_modules"), join(raiz, "node_modules"), "dir");
	git(raiz, ["init", "-q", "-b", "main"]);
	git(raiz, ["config", "user.name", "Prueba"]);
	git(raiz, ["config", "user.email", "prueba@uniformame.invalid"]);
	git(raiz, ["config", "commit.gpgsign", "false"]);
	git(raiz, ["add", "-A"]);
	git(raiz, ["commit", "-q", "-m", "inicio"]);
	return raiz;
}

/** Borra un repositorio temporal. */
export function borrarRepositorioDePrueba(raiz: string): void {
	rmSync(raiz, { recursive: true, force: true });
}
