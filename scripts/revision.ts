/**
 * La revisión completa: `pnpm revision`.
 * Fase 1 · docs/cimientos/ESTRUCTURA.md («Comandos») y docs/trabajo/FORMA-DE-TRABAJO.md («Los verdes»)
 *
 * Corre cada paso en orden y se detiene en el primero en rojo. En verde, guarda el sello con la
 * huella de lo revisado. Los pasos entraron en su fase (ver «Excepciones
 * permitidas» de la fase 1); hoy están todos. Que las migraciones apliquen desde cero lo
 * prueba `migraciones.prueba.ts` de la base, dentro de «Todas las pruebas».
 */

import { correr } from "./comandos.ts";
import { guardarSello, huellaDelArbol } from "./sello.ts";

/** Un paso de la revisión: su nombre y cómo se corre. */
export interface Paso {
	nombre: string;
	correr: () => boolean;
}

/**
 * Corre los pasos en orden y, si todos salen en verde y nada cambió mientras corrían, guarda el sello.
 * @param raiz La carpeta del repositorio.
 * @param pasos Los pasos, en el orden de ESTRUCTURA.md.
 * @returns `true` si la revisión salió en verde y quedó sellada.
 */
export function correrRevision(raiz: string, pasos: Paso[]): boolean {
	const huella = huellaDelArbol(raiz);
	for (const paso of pasos) {
		console.log(`\n▸ ${paso.nombre}`);
		if (!paso.correr()) {
			console.error(`\n✗ La revisión completa se detuvo en: ${paso.nombre}. No se guardó el sello.`);
			return false;
		}
	}
	// Si un paso cambió algo (un formateo, un archivo nuevo), lo revisado ya no es lo que hay.
	if (huellaDelArbol(raiz) !== huella) {
		console.error("\n✗ Algo cambió mientras corría la revisión. Córrela otra vez. No se guardó el sello.");
		return false;
	}
	guardarSello(raiz, huella);
	console.log(`\n✓ Revisión completa en verde. Sello ${huella.slice(0, 12)} guardado en .revision/.`);
	return true;
}

/**
 * Los pasos reales de la revisión completa, en el orden de ESTRUCTURA.md.
 * @param raiz La carpeta del repositorio.
 */
export function pasosDeLaRevision(raiz: string): Paso[] {
	return [
		{ nombre: "Estilo (Biome)", correr: () => correr(raiz, "biome", ["check", "."]) },
		{
			nombre: "Tipos (tsc)",
			// La API y los scripts; las pantallas y el sistema de diseño, con lo del navegador.
			correr: () => correr(raiz, "tsc", ["-p", "tsconfig.json"]) && correr(raiz, "tsc", ["-p", "tsconfig.web.json"]),
		},
		{ nombre: "Todas las pruebas (Vitest)", correr: () => correr(raiz, "vitest", ["run"]) },
		{ nombre: "Migraciones y llaves pendientes", correr: () => correr(raiz, "node", ["scripts/migraciones.ts"]) },
		{ nombre: "Secretos", correr: () => correr(raiz, "node", ["scripts/secretos.ts"]) },
		{ nombre: "Dependencias (pnpm audit)", correr: () => correr(raiz, "pnpm", ["audit"]) },
		{ nombre: "Archivos de creación (docs:revisar)", correr: () => correr(raiz, "node", ["scripts/docs-revisar.ts"]) },
		{
			nombre: "openapi.json al día con los contratos",
			correr: () => correr(raiz, "node", ["apps/api/src/documentar.ts", "--revisar"]),
		},
	];
}

if (import.meta.main) {
	const raiz = process.cwd();
	process.exit(correrRevision(raiz, pasosDeLaRevision(raiz)) ? 0 : 1);
}
