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

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

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
	const renglones = salida.split("\n");
	const paso = renglones.find((r) => r.includes("Revisión rápida en rojo")) ?? "";
	const primerError =
		renglones.find((r) => /error|FAIL|×|✖|lint\//i.test(r) && !r.includes("Revisión rápida en rojo")) ?? "";
	const limpio = `${paso}\n${primerError}`.replace(/\(\d+,\d+\)|:\d+:\d+|\s+/g, " ").trim();
	return createHash("sha256").update(limpio).digest("hex").slice(0, 16);
}

/** El resumen que se le pasa a Claude: el final de la salida, que es donde está el error. */
function resumen(salida: string): string {
	return salida.trim().split("\n").slice(-30).join("\n");
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
	const intentos: Record<string, number> = existsSync(rutaDeEstado)
		? JSON.parse(readFileSync(rutaDeEstado, "utf8"))
		: {};
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
			mensaje: `Revisión rápida en rojo (intento ${intento} de ${intentosAntesDelProtocolo} sobre este problema). Resuélvelo con el bucle de resolución: entiende la causa, corrige y comprueba solo este problema; si ya lo intentaste, usa otro enfoque.\n\n${resumen(revision.salida)}`,
		};
	}
	if (intento === intentosAntesDelProtocolo || !continuando) {
		const protocolo =
			leerModo(raiz) === "autonomo"
				? "Modo autónomo: evalúa dos o tres opciones, elige la más simple que cumpla, anótala en «Decisiones autónomas» de docs/registros/REGISTROS.md y sigue."
				: "Modo supervisado: detente y pregúntale a Bruno, con lo que intentaste, lo que viste y las opciones que ves.";
		return {
			codigo: 2,
			mensaje: `Tercer intento fallido sobre el mismo problema. ${protocolo}\n\n${resumen(revision.salida)}`,
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
	const corrida = spawnSync(process.execPath, ["scripts/revision-rapida.ts"], { cwd: raiz, encoding: "utf8" });
	const { codigo, mensaje } = procesarFin(
		raiz,
		{ pasa: corrida.status === 0, salida: `${corrida.stdout}${corrida.stderr}` },
		continuando,
	);
	// Con el código 2, Claude Code le pasa a Claude lo que sale por la salida de errores.
	if (codigo === 2) console.error(mensaje);
	process.exit(codigo);
}
