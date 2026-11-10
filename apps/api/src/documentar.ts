/**
 * `pnpm api:documentar`: genera `apps/api/openapi.json` desde los contratos de los módulos.
 * Fase 3 · docs/cimientos/API.md («La documentación de la API»)
 *
 * Con `--revisar` no escribe nada: compara lo que saldría con el archivo que está en git y falla si no
 * está al día, diciendo qué contratos cambiaron. Es un paso de `pnpm revision`.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { abrirConexiones, crearBase } from "./nucleo/base/conexion.ts";
import { cargarModulos } from "./nucleo/modulos.ts";
import { crearServidor } from "./servidor.ts";

/** Donde vive el documento. */
export const archivoDeOpenapi = join(import.meta.dirname, "../openapi.json");

/**
 * Arma el documento OpenAPI de los módulos de una carpeta, sin tocar la base.
 * @param carpetaDeModulos La carpeta de los módulos (la de la API, o la de prueba).
 * @returns El documento como texto, con sangría de dos espacios.
 */
export async function generarOpenapi(carpetaDeModulos = join(import.meta.dirname, "modulos")): Promise<string> {
	// La base no se toca al documentar: el grupo de conexiones no abre ninguna hasta que se usa.
	const conexiones = abrirConexiones({ max: 1 });
	const sinUsar = async () => {
		throw new Error("documentar no llama a ningún servicio");
	};
	const app = await crearServidor({
		entorno: { ENTORNO: "pruebas", DOMINIO_WEB: "https://fabrica.invalid", DOMINIO_TALLER: "https://taller.invalid" },
		base: crearBase(conexiones),
		registro: await cargarModulos(carpetaDeModulos),
		servicios: {
			identificar: sinUsar,
			revisarPermiso: sinUsar,
			versionMinimaDelParametro: sinUsar,
			escribirBitacora: sinUsar,
			guardarEventos: sinUsar,
		},
		registroTecnico: (await import("pino")).default({ level: "silent" }),
	});
	await app.ready();
	const documento = `${JSON.stringify(app.swagger(), null, 2)}\n`;
	await app.close();
	await conexiones.end();
	return documento;
}

/** Las rutas de un documento OpenAPI, con su texto, para decir cuáles cambiaron. */
function rutasDe(documento: string): Map<string, string> {
	const leido: unknown = JSON.parse(documento);
	const rutas =
		typeof leido === "object" &&
		leido !== null &&
		"paths" in leido &&
		typeof leido.paths === "object" &&
		leido.paths !== null
			? leido.paths
			: {};
	return new Map(Object.entries(rutas).map(([ruta, valor]) => [ruta, JSON.stringify(valor)]));
}

if (import.meta.main) {
	const nuevo = await generarOpenapi();
	if (!process.argv.includes("--revisar")) {
		writeFileSync(archivoDeOpenapi, nuevo);
		console.log("openapi.json al día.");
	} else {
		let anterior = "";
		try {
			anterior = readFileSync(archivoDeOpenapi, "utf8");
		} catch {
			// Si no existe, todos los contratos cuentan como nuevos.
		}
		if (anterior === nuevo) {
			console.log("openapi.json: al día con los contratos.");
		} else {
			const antes = anterior === "" ? new Map<string, string>() : rutasDe(anterior);
			const despues = rutasDe(nuevo);
			const cambiaron = [...new Set([...antes.keys(), ...despues.keys()])].filter(
				(ruta) => antes.get(ruta) !== despues.get(ruta),
			);
			console.error(
				`openapi.json no está al día. Contratos que cambiaron: ${cambiaron.join(", ") || "la información general"}.`,
			);
			console.error(
				"Corre pnpm api:documentar y revisa si un cambio rompe un contrato que usa un aparato (ver docs/cimientos/API.md).",
			);
			process.exit(1);
		}
	}
}
