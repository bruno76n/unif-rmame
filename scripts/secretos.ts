/**
 * La búsqueda de secretos de la revisión completa.
 * Fase 1 · docs/cimientos/SEGURIDAD.md («Secretos y variables de entorno»)
 *
 * Busca, en lo que se va a guardar, los secretos que usa Unifórmame: llaves privadas, direcciones de
 * Postgres con contraseña, los formatos de las llaves de Google y Resend, un `.env` fuera de
 * `.gitignore` y cualquier variable de `.env.ejemplo` con un valor escrito (así se cubren también las
 * credenciales de R2, que no tienen un formato propio).
 */

import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { archivosDelArbol, git } from "./archivos.ts";

/** Un secreto encontrado: dónde está y qué parece. Nunca lleva el valor. */
export interface Hallazgo {
	archivo: string;
	renglon: number;
	que: string;
}

/** Los formatos de secreto que usa el sistema. */
const formatos: { que: string; patron: RegExp }[] = [
	{ que: "llave privada", patron: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
	{ que: "dirección de Postgres con contraseña", patron: /postgres(?:ql)?:\/\/[^\s:/@"'`]+:[^\s@"'`]+@/ },
	{ que: "secreto de cliente de Google", patron: /\bGOCSPX-[A-Za-z0-9_-]{20,}/ },
	{ que: "llave de API de Google", patron: /\bAIza[0-9A-Za-z_-]{35}\b/ },
	{ que: "llave de Resend", patron: /\bre_[A-Za-z0-9]{6,}_[A-Za-z0-9]{16,}\b/ },
];

/**
 * Lee los nombres de las variables de entorno de `.env.ejemplo`.
 * @param raiz La carpeta del repositorio.
 * @returns Los nombres, como `RESEND_LLAVE`.
 */
function variablesDeEntorno(raiz: string): string[] {
	const ruta = join(raiz, ".env.ejemplo");
	if (!existsSync(ruta)) return [];
	return [...readFileSync(ruta, "utf8").matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1] ?? "");
}

/**
 * Revisa que `.env` esté en `.gitignore` y que ningún `.env` vaya a guardarse.
 * @param raiz La carpeta del repositorio.
 * @param archivos Lo que se va a guardar.
 */
function revisarArchivosEnv(raiz: string, archivos: string[]): Hallazgo[] {
	const hallazgos: Hallazgo[] = [];
	try {
		git(raiz, ["check-ignore", "-q", ".env"]);
	} catch {
		hallazgos.push({ archivo: ".gitignore", renglon: 0, que: "`.env` no está en .gitignore" });
	}
	for (const archivo of archivos) {
		if (/^\.env(\..+)?$/.test(basename(archivo)) && basename(archivo) !== ".env.ejemplo") {
			hallazgos.push({ archivo, renglon: 0, que: "un archivo .env se va a guardar" });
		}
	}
	return hallazgos;
}

/**
 * Busca secretos en todo lo que se va a guardar.
 * @param raiz La carpeta del repositorio.
 * @returns Cada secreto encontrado, sin su valor. Vacío si no hay ninguno.
 */
export function buscarSecretos(raiz: string): Hallazgo[] {
	const archivos = archivosDelArbol(raiz);
	const hallazgos = revisarArchivosEnv(raiz, archivos);
	const asignaciones = variablesDeEntorno(raiz).map((nombre) => ({
		que: `la variable ${nombre} con un valor escrito`,
		patron: new RegExp(`^\\s*(?:export\\s+)?${nombre}\\s*=\\s*[^\\s#]`),
	}));
	for (const archivo of archivos) {
		const contenido = readFileSync(join(raiz, archivo));
		// Los archivos binarios no llevan texto que revisar.
		if (contenido.includes(0)) continue;
		contenido
			.toString("utf8")
			.split("\n")
			.forEach((texto, i) => {
				for (const { que, patron } of [...formatos, ...asignaciones]) {
					if (patron.test(texto)) hallazgos.push({ archivo, renglon: i + 1, que });
				}
			});
	}
	return hallazgos;
}

if (import.meta.main) {
	const hallazgos = buscarSecretos(process.cwd());
	for (const { archivo, renglon, que } of hallazgos) console.error(`${archivo}:${renglon} · ${que}`);
	console.log(hallazgos.length === 0 ? "Secretos: ninguno." : `Secretos: ${hallazgos.length} encontrados.`);
	process.exit(hallazgos.length === 0 ? 0 : 1);
}
