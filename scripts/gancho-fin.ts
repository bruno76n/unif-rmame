/**
 * El gancho de fin de Claude Code (`Stop` en `.claude/settings.json`).
 * Fase 1 · docs/trabajo/FORMA-DE-TRABAJO.md («El bucle de resolución» y «Modos») y CLAUDE.md («Ganchos»)
 *
 * Al terminar cada turno corre la revisión rápida. En verde, deja terminar y cierra los problemas
 * abiertos. En rojo, cuenta el intento sobre ese problema (no sobre la revisión) y no deja terminar,
 * para que se resuelva con el bucle de resolución. Al tercer intento sobre el mismo problema pide el
 * protocolo del modo de `.claude/modo`: en `supervisado`, detenerse y preguntar a Bruno; en
 * `autonomo`, decidir y anotar en «Decisiones autónomas» de REGISTROS.md. El conteo vive en
 * `.claude/estado/`, que no entra a git.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { finalDeLaSalida, revisionRapidaCapturada } from "./comandos.ts";

/** Donde vive el conteo de intentos por problema. */
export const archivoDeEstado = ".claude/estado/intentos.json";

/** Los intentos que se dan sobre un problema antes del protocolo. */
const intentosAntesDelProtocolo = 3;

/** Lo que dijo la revisión rápida. */
export interface ResultadoDeRevision {
	pasa: boolean;
	salida: string;
}

/** Lo que el gancho le contesta a Claude Code: el código de salida y el mensaje. */
export interface RespuestaDeFin {
	/** 0 deja terminar el turno; 2 no lo deja y le pasa el mensaje a Claude. */
	codigo: 0 | 2;
	mensaje: string;
}

/**
 * Lee el modo de `.claude/modo`.
 * @returns `autonomo` solo si el archivo lo dice; cualquier otra cosa cuenta como `supervisado`, que es lo más cuidadoso.
 */
function leerModo(raiz: string): "supervisado" | "autonomo" {
	const ruta = join(raiz, ".claude/modo");
	return existsSync(ruta) && readFileSync(ruta, "utf8").trim() === "autonomo" ? "autonomo" : "supervisado";
}

/**
 * Reconoce el problema de una revisión en rojo: el paso que falló y su primer error, sin renglón ni
 * columna, para que el mismo error movido de lugar siga siendo el mismo problema.
 * @param salida Lo que escribió la revisión rápida.
 * @returns Una firma corta del problema.
 */
export function firmaDelProblema(salida: string): string {
	const renglones = salida.split("\n").map(limpiarRenglon);
	const paso = renglones.find((r) => r.includes("Revisión rápida en rojo")) ?? "";
	// Primero el renglón que nombra la prueba que falló; si no hay, el primer error de tsc o de Biome.
	const primerError =
		renglones.find((r) => r.startsWith("FAIL ")) ??
		renglones.find((r) => /error TS\d+|lint\/|format|×|✖/.test(r) && !r.includes("Revisión rápida en rojo")) ??
		"";
	return createHash("sha256").update(`${paso}\n${primerError}`).digest("hex").slice(0, 16);
}

/**
 * Quita de un renglón lo que cambia entre corridas sin que cambie el problema: los colores, los
 * tiempos, los conteos de Vitest, el renglón y la columna.
 */
function limpiarRenglon(renglon: string): string {
	return renglon
		.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "")
		.replace(/\d+(\.\d+)?\s?m?s\b/g, "")
		.replace(/\(\d+ tests?[^)]*\)/g, "")
		.replace(/\(\d+,\d+\)|:\d+:\d+/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Lee el conteo de intentos guardado.
 * @returns El conteo por firma; si no existe o está dañado, vacío: el gancho nunca deja de vigilar por eso.
 */
function leerIntentos(rutaDeEstado: string): Record<string, number> {
	if (!existsSync(rutaDeEstado)) return {};
	try {
		const leido: unknown = JSON.parse(readFileSync(rutaDeEstado, "utf8"));
		if (typeof leido !== "object" || leido === null) return {};
		return Object.fromEntries(
			Object.entries(leido).filter((par): par is [string, number] => typeof par[1] === "number"),
		);
	} catch {
		return {};
	}
}

/**
 * Decide qué hacer al terminar un turno.
 * @param raiz La carpeta del repositorio, donde están `.claude/modo` y el estado.
 * @param revision Lo que dijo la revisión rápida.
 * @param continuando `stop_hook_active`: el turno ya sigue porque este gancho no lo dejó terminar.
 * @returns El código de salida y el mensaje.
 */
export function procesarFin(raiz: string, revision: ResultadoDeRevision, continuando: boolean): RespuestaDeFin {
	const rutaDeEstado = join(raiz, archivoDeEstado);
	const intentos = leerIntentos(rutaDeEstado);
	const guardar = (estado: Record<string, number>): void => {
		mkdirSync(dirname(rutaDeEstado), { recursive: true });
		writeFileSync(rutaDeEstado, `${JSON.stringify(estado, null, "\t")}\n`);
	};

	// En verde no queda ningún problema abierto.
	if (revision.pasa) {
		guardar({});
		return { codigo: 0, mensaje: "Revisión rápida en verde." };
	}

	const firma = firmaDelProblema(revision.salida);
	const intento = (intentos[firma] ?? 0) + 1;
	guardar({ ...intentos, [firma]: intento });

	if (intento < intentosAntesDelProtocolo) {
		return {
			codigo: 2,
			mensaje: `Revisión rápida en rojo (intento ${intento} de ${intentosAntesDelProtocolo} sobre este problema). Resuélvelo con el bucle de resolución: entiende la causa, corrige y comprueba solo este problema; si ya lo intentaste, usa otro enfoque.\n\n${finalDeLaSalida(revision.salida)}`,
		};
	}
	if (intento === intentosAntesDelProtocolo || !continuando) {
		const protocolo =
			leerModo(raiz) === "autonomo"
				? "Modo autónomo: evalúa dos o tres opciones, elige la más simple que cumpla, anótala en «Decisiones autónomas» de docs/registros/REGISTROS.md y sigue."
				: "Modo supervisado: detente y pregúntale a Bruno, con lo que intentaste, lo que viste y las opciones que ves.";
		return {
			codigo: 2,
			mensaje: `Tercer intento fallido sobre el mismo problema. ${protocolo}\n\n${finalDeLaSalida(revision.salida)}`,
		};
	}
	// Ya se pidió el protocolo y el turno sigue por este gancho: se deja terminar para no dar vueltas.
	return { codigo: 0, mensaje: `La revisión rápida sigue en rojo después del protocolo (intento ${intento}).` };
}

if (import.meta.main) {
	const raiz = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
	let continuando = false;
	try {
		const entrada: unknown = JSON.parse(readFileSync(0, "utf8"));
		continuando =
			typeof entrada === "object" &&
			entrada !== null &&
			"stop_hook_active" in entrada &&
			entrada.stop_hook_active === true;
	} catch {
		// Sin entrada legible se toma como un fin de turno normal.
	}
	const { codigo, mensaje } = procesarFin(raiz, revisionRapidaCapturada(raiz), continuando);
	// Con el código 2, Claude Code le pasa a Claude lo que sale por la salida de errores.
	if (codigo === 2) console.error(mensaje);
	process.exit(codigo);
}
