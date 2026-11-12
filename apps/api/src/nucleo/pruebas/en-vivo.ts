/**
 * Ayudas para probar los avisos en vivo: escuchar `GET /v1/eventos`, esperar a que llegue algo y procesar
 * la bandeja como el worker.
 * Fase 4 · docs/fases/04-servicios-comunes.md (parte 1)
 */

import { Temporal } from "temporal-polyfill";
import { expect } from "vitest";
import { crearBase } from "../base/conexion.ts";
import { procesarEventos, repartirConLosModulos } from "../trabajos/procesar-eventos.ts";
import type { ServidorDePrueba } from "./servidor-de-prueba.ts";

/** Lo que llega por una conexión de eventos: cada bloque, ya separado. */
export interface Escucha {
	bloques: string[];
	/** Los eventos con nombre, con sus datos leídos. */
	eventos: () => { nombre: string; datos: unknown }[];
	/** Si el servidor ya cortó la conexión. */
	cortada: () => boolean;
	cerrar: () => void;
}

/**
 * Abre `GET /v1/eventos` en un servidor que escucha de verdad, y junta lo que llega.
 * @param direccion La dirección del servidor.
 * @param quien Quién se conecta: su nombre en `x-prueba-quien`, la cookie de su sesión de verdad o la llave
 * de un aparato (`Authorization: Llave …`).
 */
export async function escuchar(
	direccion: string,
	quien: string | { sesion: string } | { llave: string },
): Promise<Escucha> {
	const control = new AbortController();
	const respuesta = await fetch(`${direccion}/v1/eventos`, {
		headers:
			typeof quien === "string"
				? { "x-prueba-quien": quien }
				: "sesion" in quien
					? { cookie: `ua_sesion=${quien.sesion}` }
					: { authorization: quien.llave },
		signal: control.signal,
	});
	expect(respuesta.status).toBe(200);
	expect(respuesta.headers.get("content-type")).toBe("text/event-stream");
	const bloques: string[] = [];
	const lector = respuesta.body?.getReader();
	const decodificador = new TextDecoder();
	let resto = "";
	let cortada = false;
	(async () => {
		for (;;) {
			const leido = await lector?.read().catch(() => undefined);
			if (leido === undefined || leido.done) {
				cortada = leido?.done === true;
				return;
			}
			resto += decodificador.decode(leido.value, { stream: true });
			const partes = resto.split("\n\n");
			resto = partes.pop() ?? "";
			bloques.push(...partes);
		}
	})();
	return {
		bloques,
		eventos: () =>
			bloques.flatMap((bloque) => {
				const nombre = /^event: (.+)$/m.exec(bloque)?.[1];
				const datos = /^data: (.+)$/m.exec(bloque)?.[1];
				return nombre === undefined || datos === undefined ? [] : [{ nombre, datos: JSON.parse(datos) }];
			}),
		cortada: () => cortada,
		cerrar: () => control.abort(),
	};
}

/** Espera hasta que se cumpla algo, o falla a los dos segundos. */
export async function esperarA(condicion: () => boolean): Promise<void> {
	for (let intento = 0; intento < 100 && !condicion(); intento++) {
		await new Promise((listo) => setTimeout(listo, 20));
	}
	expect(condicion()).toBe(true);
}

/**
 * Procesa la bandeja como lo hace el worker: reparte y hace `NOTIFY`.
 * @param servidor El servidor de prueba, por su base.
 */
export async function procesarComoElWorker(servidor: ServidorDePrueba): Promise<void> {
	await procesarEventos({
		base: crearBase(servidor.base.app),
		// Los mismos módulos que registró el servidor de prueba.
		repartir: repartirConLosModulos(servidor.modulos, () => Temporal.Now.instant()),
		avisarFalla: async () => undefined,
		ahora: () => Temporal.Now.instant(),
	});
}
