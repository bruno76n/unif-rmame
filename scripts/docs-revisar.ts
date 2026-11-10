/**
 * La revisión de los archivos de creación: `pnpm docs:revisar`.
 * Fase 1 · .claude/rules/documentos.md (reglas 1, 5 y 9) y docs/cimientos/ESTRUCTURA.md («Comandos»)
 *
 * Revisa todos los `.md` de `docs/`, `AGENTS.md`, `CLAUDE.md` y `.claude/`:
 * - el encabezado de cuatro líneas (el de las fases lleva Etapa, Estado, Antes de empezar y Se conecta con);
 * - que cada enlace relativo lleve a un archivo que existe, y su ancla, a un título de ese archivo;
 * - que cada «Se conecta con» esté en los dos archivos;
 * - que cada archivo esté en docs/INDICE.md.
 * De los registros solo revisa el encabezado de la bitácora y de REGISTROS.md; las carpetas de
 * registros (las sesiones y las auditorías) y el
 * contenido de los registros no se revisan (ver docs/trabajo/FORMA-DE-TRABAJO.md, «Los registros»).
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { archivosDelArbol } from "./archivos.ts";

/** Un error en un archivo de creación. */
export interface ErrorDeDocumento {
	tipo: "encabezado" | "enlace" | "ancla" | "conexion" | "indice";
	archivo: string;
	renglon: number;
	que: string;
}

/** Un enlace de un documento, con su renglón. */
interface Enlace {
	renglon: number;
	destino: string;
}

/** Lo que se lee de un documento una sola vez. */
interface Documento {
	ruta: string;
	renglones: string[];
	/** Los renglones sin los bloques de código ni el código en línea, donde se buscan enlaces y títulos. */
	texto: string[];
}

const indice = "docs/INDICE.md";
const registros = "docs/registros/";
/** Las carpetas de los registros (sesiones, auditorías): su contenido no se revisa. */
const dentroDeRegistros = /^docs\/registros\/[^/]+\//;

/** Los campos del encabezado, en orden, y los estados que acepta cada tipo de archivo. */
const encabezadoDeTema = {
	campos: ["Qué cubre", "Estado", "Se construye en", "Se conecta con"],
	estados: ["Decidido", "En diseño", "Por investigar", "Para después"],
};
const encabezadoDeFase = {
	campos: ["Etapa", "Estado", "Antes de empezar", "Se conecta con"],
	estados: ["Pendiente", "En curso", "Terminada"],
};

/**
 * Dice si un archivo es de los que se revisan.
 * @param ruta La ruta relativa a la raíz.
 */
function esDeCreacion(ruta: string): boolean {
	if (!ruta.endsWith(".md") || dentroDeRegistros.test(ruta)) return false;
	return ruta.startsWith("docs/") || ruta.startsWith(".claude/") || ruta === "AGENTS.md" || ruta === "CLAUDE.md";
}

/**
 * Lee un documento y quita lo que no cuenta para enlaces ni títulos: los bloques de código y el código en línea.
 * @param raiz La carpeta del repositorio.
 * @param ruta La ruta relativa del documento.
 */
function leerDocumento(raiz: string, ruta: string): Documento {
	const renglones = readFileSync(join(raiz, ruta), "utf8").split("\n");
	let enCodigo = false;
	const texto = renglones.map((renglon) => {
		if (/^\s*(```|~~~)/.test(renglon)) {
			enCodigo = !enCodigo;
			return "";
		}
		return enCodigo ? "" : renglon.replace(/`[^`]*`/g, "``");
	});
	return { ruta, renglones, texto };
}

/**
 * Convierte un título en su ancla, como lo hace GitHub: en minúsculas, sin puntuación (salvo `-` y `_`)
 * y con un guion por cada espacio. Los acentos se quedan.
 * @param titulo El texto del título, sin los `#`.
 */
export function anclaDe(titulo: string): string {
	return titulo
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/[`*]/g, "")
		.trim()
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\p{M} _-]/gu, "")
		.replace(/ /g, "-");
}

/** Las anclas de un documento: una por título; los repetidos llevan `-1`, `-2`… */
function anclasDe(documento: Documento): Set<string> {
	const anclas = new Set<string>();
	const vistas = new Map<string, number>();
	documento.renglones.forEach((renglon, i) => {
		// Los títulos se buscan en el texto original, pero no dentro de un bloque de código.
		if (documento.texto[i] === "" && renglon !== "") return;
		const titulo = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(renglon)?.[1];
		if (titulo === undefined) return;
		const base = anclaDe(titulo);
		const veces = vistas.get(base) ?? 0;
		anclas.add(veces === 0 ? base : `${base}-${veces}`);
		vistas.set(base, veces + 1);
	});
	return anclas;
}

/** Los enlaces relativos de unos renglones; los de otra página (`https:`, `mailto:`) no cuentan. */
function enlacesDe(texto: string[], desde = 0): Enlace[] {
	const enlaces: Enlace[] = [];
	texto.forEach((renglon, i) => {
		for (const m of renglon.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
			const destino = m[1] ?? "";
			if (!/^[a-z][a-z0-9+.-]*:/i.test(destino)) enlaces.push({ renglon: desde + i + 1, destino });
		}
	});
	return enlaces;
}

/**
 * Resuelve a dónde lleva un enlace.
 * @param origen La ruta del documento que lo tiene.
 * @param destino Lo que va entre paréntesis.
 * @returns La ruta relativa a la raíz (vacía si es solo un ancla) y el ancla, sin codificar.
 */
function resolver(origen: string, destino: string): { ruta: string; ancla: string } {
	const [camino = "", ancla = ""] = destino.split("#", 2);
	const ruta = camino === "" ? origen : normalize(join(dirname(origen), decodeURI(camino))).replaceAll("\\", "/");
	let anclaLimpia = ancla;
	try {
		anclaLimpia = decodeURIComponent(ancla);
	} catch {
		// Un ancla mal codificada se compara tal cual y sale como ancla que no existe.
	}
	return { ruta, ancla: anclaLimpia.toLowerCase() };
}

/**
 * Revisa el encabezado de un documento.
 * @returns Los errores, y los enlaces de «Se conecta con» para revisar las conexiones.
 */
function revisarEncabezado(documento: Documento): { errores: ErrorDeDocumento[]; conexiones: Enlace[] } {
	const { ruta, renglones } = documento;
	const errores: ErrorDeDocumento[] = [];
	const plantilla = /^docs\/fases\/\d\d-/.test(ruta) ? encabezadoDeFase : encabezadoDeTema;
	const error = (renglon: number, que: string): ErrorDeDocumento => ({
		tipo: "encabezado",
		archivo: ruta,
		renglon,
		que,
	});

	// Antes del título solo puede ir el bloque de configuración (`---`) o la línea `@AGENTS.md` de CLAUDE.md.
	let i = 0;
	if (renglones[0] === "---") {
		i = renglones.indexOf("---", 1) + 1;
		if (i === 0) return { errores: [error(1, "el bloque de configuración no se cierra con ---")], conexiones: [] };
	}
	while (i < renglones.length && (renglones[i]?.trim() === "" || renglones[i]?.startsWith("@"))) i++;
	if (!/^# \S/.test(renglones[i] ?? "")) return { errores: [error(i + 1, "falta el título (# Tema)")], conexiones: [] };
	if (renglones[i + 1]?.trim() !== "") errores.push(error(i + 2, "falta el renglón vacío después del título"));

	let conexiones: Enlace[] = [];
	plantilla.campos.forEach((campo, j) => {
		const numero = i + 3 + j;
		const renglon = renglones[numero - 1] ?? "";
		const prefijo = `> **${campo}:**`;
		if (!renglon.startsWith(prefijo)) {
			errores.push(error(numero, `falta «${prefijo}» en el renglón ${j + 1} del encabezado`));
			return;
		}
		const valor = renglon.slice(prefijo.length).trim();
		if (campo === "Estado" && !plantilla.estados.some((estado) => valor.startsWith(estado))) {
			errores.push(error(numero, `el estado «${valor}» no es ${plantilla.estados.join(", ")}`));
		}
		if (campo === "Se construye en" && !/\[[^\]]+\]\([^)]+\)/.test(valor)) {
			errores.push(error(numero, "«Se construye en» no enlaza a su fase"));
		}
	});
	// Las conexiones se leen aunque el encabezado esté incompleto, para no sumar errores que no son.
	const deConexiones = renglones.findIndex((r, k) => k > i && k <= i + 6 && r.startsWith("> **Se conecta con:**"));
	if (deConexiones >= 0) conexiones = enlacesDe([renglones[deConexiones] ?? ""], deConexiones);
	return { errores, conexiones };
}

/**
 * Revisa todos los archivos de creación.
 * @param raiz La carpeta del repositorio.
 * @returns Cada error con su archivo y su renglón. Vacío si todo está bien.
 */
export function revisarDocumentos(raiz: string): ErrorDeDocumento[] {
	const rutas = archivosDelArbol(raiz).filter(esDeCreacion);
	const documentos = new Map(rutas.map((ruta) => [ruta, leerDocumento(raiz, ruta)]));
	const anclas = new Map<string, Set<string>>();
	const anclasDeRuta = (ruta: string): Set<string> | undefined => {
		const documento = documentos.get(ruta);
		if (documento && !anclas.has(ruta)) anclas.set(ruta, anclasDe(documento));
		return anclas.get(ruta);
	};
	const errores: ErrorDeDocumento[] = [];
	const conexiones = new Map<string, Set<string>>();

	for (const documento of documentos.values()) {
		const { ruta } = documento;
		const encabezado = revisarEncabezado(documento);
		errores.push(...encabezado.errores);
		conexiones.set(ruta, new Set(encabezado.conexiones.map((e) => resolver(ruta, e.destino).ruta)));

		// Del contenido de los registros no se revisa nada; de los demás, cada enlace y su ancla.
		const enlaces = ruta.startsWith(registros) ? encabezado.conexiones : enlacesDe(documento.texto);
		for (const { renglon, destino } of enlaces) {
			const objetivo = resolver(ruta, destino);
			if (!existsSync(join(raiz, objetivo.ruta))) {
				errores.push({
					tipo: "enlace",
					archivo: ruta,
					renglon,
					que: `el enlace a ${destino} no lleva a ningún archivo`,
				});
				continue;
			}
			if (objetivo.ancla === "" || !objetivo.ruta.endsWith(".md") || statSync(join(raiz, objetivo.ruta)).isDirectory())
				continue;
			const delObjetivo = anclasDeRuta(objetivo.ruta) ?? anclasDe(leerDocumento(raiz, objetivo.ruta));
			if (!delObjetivo.has(objetivo.ancla)) {
				errores.push({
					tipo: "ancla",
					archivo: ruta,
					renglon,
					que: `el ancla #${objetivo.ancla} no existe en ${objetivo.ruta}`,
				});
			}
		}
	}

	// Las conexiones van en los dos sentidos: si A se conecta con B, B se conecta con A.
	for (const [ruta, destinos] of conexiones) {
		for (const destino of destinos) {
			if (destino === ruta || !conexiones.has(destino)) continue;
			if (!conexiones.get(destino)?.has(ruta)) {
				const renglon =
					(documentos.get(ruta)?.renglones.findIndex((r) => r.startsWith("> **Se conecta con:**")) ?? 0) + 1;
				errores.push({
					tipo: "conexion",
					archivo: ruta,
					renglon,
					que: `se conecta con ${destino}, pero ${destino} no la nombra`,
				});
			}
		}
	}

	// Cada archivo de creación está en el índice.
	const delIndice = documentos.get(indice);
	if (delIndice === undefined) {
		errores.push({ tipo: "indice", archivo: indice, renglon: 0, que: "no existe el índice" });
	} else {
		const listados = new Set(enlacesDe(delIndice.texto).map((e) => resolver(indice, e.destino).ruta));
		for (const ruta of documentos.keys()) {
			if (!listados.has(ruta)) errores.push({ tipo: "indice", archivo: ruta, renglon: 0, que: `no está en ${indice}` });
		}
	}
	return errores;
}

if (import.meta.main) {
	const raiz = process.cwd();
	const errores = revisarDocumentos(raiz);
	for (const { archivo, renglon, que } of errores) console.error(`${archivo}:${renglon} · ${que}`);
	const revisados = archivosDelArbol(raiz).filter(esDeCreacion).length;
	console.log(
		errores.length === 0
			? `Archivos de creación: ${revisados} revisados, en verde.`
			: `Archivos de creación: ${errores.length} errores en ${new Set(errores.map((e) => e.archivo)).size} archivos.`,
	);
	process.exit(errores.length === 0 ? 0 : 1);
}
