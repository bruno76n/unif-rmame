/**
 * El arnés de las pruebas del puente: la API real (Postgres de Testcontainers) escuchando en un puerto local, la Zebra
 * de Aduana ligada al puente de prueba, la Zebra de mentira y las piezas del puente con su configuración en memoria y su
 * diario y su registro en una carpeta temporal.
 * Fase 20 · docs/apps/puente-de-impresion.md («Cómo se prueba»)
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { levantarZebraDeMentira, type ZebraDeMentira } from "@uniformame/pruebas/simuladores/zebra";
import { z } from "zod";
import {
	aparatosRegistradosDePrueba,
	quienesDePrueba,
	secretoDePrueba,
} from "../../api/src/nucleo/pruebas/cuentas-de-prueba.ts";
import { mandarAccion } from "../../api/src/nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../api/src/nucleo/pruebas/servidor-de-prueba.ts";
import { crearApiDelPuente } from "./api.ts";
import type { Configuracion } from "./configuracion.ts";
import { crearDiario } from "./diario.ts";
import { crearRegistro } from "./registro.ts";
import type { PiezasDelPuente } from "./trabajos.ts";

/** El id del puente de Aduana de prueba. */
export function puenteDeAduana(): string {
	const quien = quienesDePrueba.puente;
	if (quien?.tipo !== "aparato") throw new Error("no hay puente de prueba");
	return quien.dispositivoId;
}

/** Lo que arma el arnés. */
export interface PuenteDePrueba {
	servidor: ServidorDePrueba;
	/** La dirección de la API que escucha. */
	api: string;
	zebra: ZebraDeMentira;
	/** La carpeta temporal del diario y del registro. */
	carpeta: string;
	/** La configuración del puente, en memoria. */
	configuracion: { actual: Configuracion };
	/** Las llamadas que hizo el puente a la API: método y ruta. */
	llamadas: string[];
	/** El `fetch` del puente: anota cada llamada y corta la red cuando se pide. */
	fetch: typeof fetch;
	/** Las piezas del puente; `cortarLaRed` hace que la siguiente llamada que cumpla la condición no llegue. */
	piezas: PiezasDelPuente;
	cortarLaRed: (condicion: (url: string) => boolean) => void;
	/** Ventas pide un trabajo de prueba para la Zebra de Aduana. */
	pedirTrabajo: (ids: string[], copias: number) => Promise<string>;
	/** El estado y el error de un trabajo. */
	trabajo: (id: string) => Promise<{ estado: string; error: string | null }>;
	/** El ZPL de un trabajo como lo da su ruta al puente, mientras el trabajo está pendiente. */
	zplDe: (id: string) => Promise<string>;
	/** El texto del registro. */
	registro: () => Promise<string>;
	cerrar: () => Promise<void>;
}

/**
 * Levanta el arnés.
 * @param opciones Los avisos en vivo del servidor, si la prueba los usa.
 */
export async function levantarPuenteDePrueba(opciones: { avisosEnVivo?: boolean } = {}): Promise<PuenteDePrueba> {
	const servidor = await crearServidorDePrueba(
		opciones.avisosEnVivo === true ? { avisosEnVivo: { latidoMs: 60_000, alcanceReal: true } } : {},
	);
	const api = await servidor.app.listen({ host: "127.0.0.1", port: 0 });
	const zebra = await levantarZebraDeMentira();
	const carpeta = await mkdtemp(join(tmpdir(), "puente-"));
	const aduana = String(
		(await servidor.base.dueno.query("SELECT id FROM ubicaciones WHERE codigo = 'ADU'")).rows[0]?.id,
	);
	await mandarAccion(
		servidor,
		"admin.guardar_impresora",
		{ datos: { nombre: "Zebra Aduana", modelo: "ZD421", ubicacion_id: aduana, dispositivo_id: puenteDeAduana() } },
		"duena",
	);
	const configuracion: { actual: Configuracion } = {
		actual: {
			api,
			llave_id: aparatosRegistradosDePrueba.puente.llaveId,
			secreto: secretoDePrueba("puente"),
			zebra: zebra.direccion,
			intervalo_segundos: 60,
		},
	};
	const llamadas: string[] = [];
	let corte: ((url: string) => boolean) | null = null;
	const fetchDelPuente: typeof fetch = async (entrada, init) => {
		const url = entrada instanceof Request ? entrada.url : String(entrada);
		if (corte?.(url) === true) {
			corte = null;
			throw new TypeError("fetch failed");
		}
		llamadas.push(`${init?.method ?? "GET"} ${new URL(url).pathname}`);
		return fetch(entrada, init);
	};
	const piezas: PiezasDelPuente = {
		api: crearApiDelPuente({
			leer: async () => configuracion.actual,
			guardar: async (nueva) => {
				configuracion.actual = nueva;
			},
			fetch: fetchDelPuente,
			reintentos: 0,
		}),
		diario: crearDiario(join(carpeta, "diario.jsonl")),
		registro: crearRegistro(join(carpeta, "registro.txt")),
		zebra: async () => configuracion.actual.zebra,
		esperaDeLaZebra: 500,
	};
	return {
		servidor,
		api,
		zebra,
		carpeta,
		configuracion,
		llamadas,
		fetch: fetchDelPuente,
		piezas,
		cortarLaRed: (condicion) => {
			corte = condicion;
		},
		pedirTrabajo: async (ids, copias) => {
			const respuesta = await mandarAccion(servidor, "prueba.imprimir", {
				datos: { ubicacion_id: aduana, ids, copias },
			});
			if (respuesta.estado !== 200) throw new Error(`no se pidió el trabajo: ${JSON.stringify(respuesta.cuerpo)}`);
			return z.object({ trabajo_id: z.uuid() }).parse(respuesta.cuerpo.resultado).trabajo_id;
		},
		trabajo: async (id) => {
			const { rows } = await servidor.base.dueno.query("SELECT estado, error FROM trabajos_impresion WHERE id = $1", [
				id,
			]);
			return z.object({ estado: z.string(), error: z.string().nullable() }).parse(rows[0]);
		},
		zplDe: async (id) => {
			const { rows } = await servidor.base.dueno.query("SELECT ids, copias FROM trabajos_impresion WHERE id = $1", [
				id,
			]);
			const { ids, copias } = z.object({ ids: z.array(z.uuid()), copias: z.number() }).parse(rows[0]);
			const varios = ids.length > 1 ? `&ids=${ids.join(",")}` : "";
			const respuesta = await servidor.app.inject({
				method: "GET",
				url: `/v1/etiquetas/prueba/${ids[0]}?formato=zpl&copias=${copias}${varios}`,
				headers: { "x-prueba-quien": "puente", "x-app-version": "1.0.0" },
			});
			if (respuesta.statusCode !== 200) throw new Error(`sin ZPL: ${respuesta.body}`);
			return respuesta.body;
		},
		registro: () => readFile(join(carpeta, "registro.txt"), "utf8").catch(() => ""),
		cerrar: async () => {
			await zebra.cerrar();
			await servidor.cerrar();
			await rm(carpeta, { recursive: true, force: true });
		},
	};
}
