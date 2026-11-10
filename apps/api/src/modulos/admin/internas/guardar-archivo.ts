/**
 * `admin.guardar_archivo`: guarda en R2 un archivo que genera el servidor y deja su registro.
 * Fase 4 · docs/modulos/admin/archivos.md («`admin.guardar_archivo` · interna»)
 *
 * Lo usan el PDF de etiquetas, el de la orden de compra, el ZIP del contador y las guías. Si la acción que
 * lo llama lo necesita para confirmarse, lo llama antes de confirmar: si falla, la acción falla.
 */

import { createHash } from "node:crypto";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { leerParametro } from "../../../nucleo/parametros.ts";
import { claveEnElAlmacen, columnasDeQuienSube } from "../dominio/archivos.ts";
import { archivos, propositosDeArchivo } from "../tablas.ts";

/** Lo que recibe. */
const pedido = z.object({
	contenido: z.instanceof(Uint8Array),
	proposito: z.enum(propositosDeArchivo),
	modulo: z.string().min(1),
	entidad: z.string().optional(),
	entidad_id: z.uuid().optional(),
	nombre_original: z.string().min(1).max(200),
	tipo_mime: z.string().min(1),
});

/**
 * Guarda el archivo.
 * @param contexto El contexto de la acción o del trabajo.
 * @param datos El contenido, su propósito, su documento, su nombre y su tipo.
 * @returns `archivo_id` y una dirección firmada para bajarlo.
 */
export async function guardarArchivo(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<{ archivo_id: string; url: string }> {
	const archivo = pedido.parse(datos);
	if (contexto.almacen === undefined) throw new Error("no hay almacén de archivos");
	const id = uuidv7();
	const clave = claveEnElAlmacen(archivo.modulo, contexto.diaDeNegocio, id);
	await contexto.almacen.guardar(clave, archivo.contenido, archivo.tipo_mime);
	await contexto.transaccion.insert(archivos).values({
		id,
		proposito: archivo.proposito,
		modulo: archivo.modulo,
		entidad: archivo.entidad ?? null,
		entidadId: archivo.entidad_id ?? null,
		nombreOriginal: archivo.nombre_original,
		tipoMime: archivo.tipo_mime,
		tamanoBytes: archivo.contenido.byteLength,
		sha256: createHash("sha256").update(archivo.contenido).digest("hex"),
		almacenClave: clave,
		subidoEn: contexto.ahora.toString(),
		...columnasDeQuienSube(contexto.quien),
	});
	const minutos = Number(await leerParametro(contexto.transaccion, { clave: "admin.minutos_enlace_archivo" }));
	const url = await contexto.almacen.direccionDeBajada(
		clave,
		{ nombre: archivo.nombre_original, descarga: true },
		minutos * 60,
	);
	return { archivo_id: id, url };
}
