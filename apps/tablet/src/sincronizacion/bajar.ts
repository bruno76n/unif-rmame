/**
 * Bajar lo que cambió: páginas de `GET /v1/sync/bajar` desde su cursor, cada una aplicada en una transacción, hasta
 * quedar al día; con `requiere_foto`, la foto completa. Y la foto: todas sus páginas, que reemplazan la copia sin tocar
 * la cola ni lo que nació en la tablet. Cuando le toca, cambia su llave.
 * Fase 20 · docs/apps/tablet.md («Cómo baja») y docs/cimientos/SINCRONIZACION.md («Bajar» y «Foto»)
 *
 * La copia no revisa llaves foráneas: guarda lo que baja tal cual y las pantallas no muestran lo que no encuentran, así
 * que un hijo que llega antes que su padre (decisión 412) espera sin romper nada.
 */

import { respuestaDeBajada, respuestaDeFoto } from "@uniformame/compartido/contratos/sincronizacion";
import type { z } from "zod";
import type { BaseDeLaTablet } from "../copia/base.ts";
import { aplicarCambios, reemplazarConFoto } from "../copia/copia.ts";
import { type Conexion, llamarConLlave, rotarLlave } from "./api.ts";
import { guardarDato, leerDato } from "./estado.ts";

/**
 * Baja la foto completa y reemplaza la copia; sigue bajando desde el inicio de la foto.
 * @param base La base local.
 * @param conexion A dónde llama.
 * @param alAvance Cuántos renglones van, para «Preparando la tablet…».
 */
export async function bajarFoto(
	base: BaseDeLaTablet,
	conexion: Conexion,
	alAvance: (renglones: number) => void = () => undefined,
): Promise<void> {
	const foto: z.infer<typeof respuestaDeFoto>["cambios"] = [];
	let parte: string | null = null;
	let cursor: string | null = null;
	do {
		const pagina = respuestaDeFoto.parse(
			await llamarConLlave(
				base,
				conexion,
				`/v1/sync/foto${parte === null ? "" : `?parte=${encodeURIComponent(parte)}`}`,
			),
		);
		foto.push(...pagina.cambios);
		alAvance(foto.length);
		parte = pagina.parte;
		cursor = pagina.cursor_bajar;
	} while (parte !== null);
	await reemplazarConFoto(base, foto);
	await guardarDato(base, "cursor", cursor);
	await guardarDato(base, "estado", "lista");
	await guardarDato(base, "ultima_bajada", new Date().toISOString());
}

/**
 * Baja lo que cambió desde su cursor, página por página, hasta quedar al día.
 * @param base La base local.
 * @param conexion A dónde llama.
 */
export async function bajarCambios(base: BaseDeLaTablet, conexion: Conexion): Promise<void> {
	let rotar = false;
	for (;;) {
		const cursor = await leerDato(base, "cursor");
		if (typeof cursor !== "string") {
			await bajarFoto(base, conexion);
			return;
		}
		const pagina = respuestaDeBajada.parse(
			await llamarConLlave(base, conexion, `/v1/sync/bajar?desde=${encodeURIComponent(cursor)}`),
		);
		if (pagina.requiere_foto) {
			await bajarFoto(base, conexion);
			return;
		}
		await aplicarCambios(base, pagina.cambios);
		await guardarDato(base, "cursor", pagina.cursor);
		rotar ||= pagina.rotar_llave;
		if (!pagina.hay_mas) break;
	}
	await guardarDato(base, "ultima_bajada", new Date().toISOString());
	if (rotar) await rotarLlave(base, conexion);
}
