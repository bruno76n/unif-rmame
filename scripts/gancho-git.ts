/**
 * El gancho de git antes de cada commit (`.githooks/pre-commit`).
 * Fase 1 · docs/cimientos/ESTRUCTURA.md («Comandos», el sello)
 *
 * Tres casos, según lo que lleva el commit:
 * 1. solo `docs/registros/`: pasa;
 * 2. solo documentos (`*.md`): pasa si `pnpm docs:revisar` sale en verde;
 * 3. código: pasa solo si el sello de la última revisión completa es de exactamente lo que se guarda.
 */

import { archivosDelCommit } from "./archivos.ts";
import { correr } from "./comandos.ts";
import { carpetaDeRegistros, huellaDelIndice, leerSello } from "./sello.ts";

/** Lo que decide el gancho y por qué. */
export interface Veredicto {
	pasa: boolean;
	motivo: string;
}

/**
 * Decide si el commit que se está haciendo puede entrar.
 * @param raiz La carpeta del repositorio.
 * @returns Si pasa y el porqué, para que quien hace el commit sepa qué hacer.
 */
export function revisarCommit(raiz: string): Veredicto {
	const archivos = archivosDelCommit(raiz);
	if (archivos.every((ruta) => ruta.startsWith(carpetaDeRegistros))) {
		return { pasa: true, motivo: "Solo registros: no piden revisión." };
	}
	if (archivos.every((ruta) => ruta.endsWith(".md"))) {
		const enVerde = correr(raiz, "node", ["scripts/docs-revisar.ts"]);
		return enVerde
			? { pasa: true, motivo: "Solo documentos, con pnpm docs:revisar en verde." }
			: {
					pasa: false,
					motivo: "Solo documentos, pero pnpm docs:revisar encontró errores. Arréglalos y vuelve a intentar.",
				};
	}
	const sello = leerSello(raiz);
	if (sello === undefined) {
		return { pasa: false, motivo: "Commit de código sin sello. Corre pnpm revision y vuelve a intentar." };
	}
	if (sello !== huellaDelIndice(raiz)) {
		return {
			pasa: false,
			motivo:
				"El sello no es de lo que se va a guardar. Corre pnpm revision, agrega todo lo revisado (git add -A) y vuelve a intentar.",
		};
	}
	return { pasa: true, motivo: "Código con sello vigente." };
}

if (import.meta.main) {
	const { pasa, motivo } = revisarCommit(process.cwd());
	console[pasa ? "log" : "error"](`${pasa ? "✓" : "✗"} Gancho de git: ${motivo}`);
	process.exit(pasa ? 0 : 1);
}
