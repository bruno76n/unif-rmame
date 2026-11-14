/**
 * Subir la cola: en tandas de hasta `sync.tanda_max_comandos`, en el orden en que pasó, sin mandar la siguiente hasta
 * tener la respuesta. Lo aplicado, repetido o con excepción sale de la cola y su renglón deja de estar «guardada aquí»;
 * lo apartado sale y su renglón queda marcado. Con `detenido` se para, y la siguiente vez manda desde el primero sin
 * respuesta; sin internet se queda con su cola y sus claves. Revocada, sigue subiendo hasta vaciarla.
 * Fase 20 · docs/apps/tablet.md («Cómo sube») y docs/cimientos/SINCRONIZACION.md («Subir · `POST /v1/sync/subir`»)
 */

import { respuestaDeSubida } from "@uniformame/compartido/contratos/sincronizacion";
import type { z } from "zod";
import { type BaseDeLaTablet, type ComandoEnCola, tablasQueBajan } from "../copia/base.ts";
import { parametroEntero } from "../copia/parametros.ts";
import { type Conexion, llamarConLlave } from "./api.ts";
import { guardarDato } from "./estado.ts";

/** Lo que pasó al subir. */
export interface Subida {
	/** Los comandos que contestó el servidor. */
	contestados: number;
	/** El servidor cortó una tanda: lo que falta se manda la siguiente vez. */
	detenido: boolean;
	/** Hay algo nuevo que bajar. */
	hayCambios: boolean;
}

/**
 * Aplica las respuestas de una tanda, en una transacción: cada comando contestado sale de la cola y marca sus renglones.
 * @param base La base local.
 * @param tanda Lo que se mandó.
 * @param respuestas Lo que contestó el servidor, en el mismo orden.
 */
async function aplicarRespuestas(
	base: BaseDeLaTablet,
	tanda: readonly ComandoEnCola[],
	respuestas: z.infer<typeof respuestaDeSubida>["respuestas"],
): Promise<void> {
	await base.transaction("rw", ["cola", ...Object.keys(tablasQueBajan)], async () => {
		for (const respuesta of respuestas) {
			const comando = tanda.find((suyo) => suyo.clave_idempotencia === respuesta.clave_idempotencia);
			if (comando?.orden === undefined) continue;
			await base.cola.delete(comando.orden);
			for (const { tabla, id } of comando.renglones) {
				const renglon = await base.copia(tabla).get(id);
				if (renglon?._local === undefined) continue;
				// Apartado, se queda marcado; si no, ya es del servidor hasta que baje su renglón.
				if (respuesta.resultado === "apartado") await base.copia(tabla).update(id, { _local: "apartado" });
				else await base.copia(tabla).update(id, { _local: undefined });
			}
		}
	});
}

/**
 * Sube la cola hasta vaciarla o hasta que el servidor corte una tanda.
 * @param base La base local.
 * @param conexion A dónde llama.
 * @throws `SinInternet`, `HayQueActualizar` o el error de la API: lo que no tuvo respuesta sigue en la cola.
 */
export async function subirCola(base: BaseDeLaTablet, conexion: Conexion): Promise<Subida> {
	const subida: Subida = { contestados: 0, detenido: false, hayCambios: false };
	if ((await base.cola.count()) === 0) return subida;
	const maximo = await parametroEntero(base, "sync.tanda_max_comandos");
	for (;;) {
		const tanda = await base.cola.orderBy("orden").limit(maximo).toArray();
		if (tanda.length === 0) return subida;
		const cuerpo = respuestaDeSubida.parse(
			await llamarConLlave(base, conexion, "/v1/sync/subir", {
				method: "POST",
				body: JSON.stringify({
					enviado_en: new Date().toISOString(),
					pendientes_por_subir: await base.cola.count(),
					comandos: tanda.map((comando) => ({
						clave_idempotencia: comando.clave_idempotencia,
						accion: comando.accion,
						datos: comando.datos,
						ocurrido_en: comando.ocurrido_en,
						...(comando.persona_id === undefined ? {} : { persona_id: comando.persona_id }),
					})),
				}),
			}),
		);
		await aplicarRespuestas(base, tanda, cuerpo.respuestas);
		// La última subida de la tablet del taller: con ella calcula la salud de los lotes, como la API.
		await guardarDato(base, "ultima_subida", new Date().toISOString());
		subida.contestados += cuerpo.respuestas.length;
		subida.hayCambios ||= cuerpo.hay_cambios;
		if (cuerpo.revocado) await guardarDato(base, "estado", "revocada");
		if (cuerpo.detenido || cuerpo.respuestas.length === 0) {
			subida.detenido = cuerpo.detenido;
			return subida;
		}
	}
}
