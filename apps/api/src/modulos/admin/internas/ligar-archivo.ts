/**
 * `admin.ligar_archivo`: liga un archivo subido al documento que lo usa.
 * Fase 4 · docs/modulos/admin/archivos.md («`admin.ligar_archivo` · interna»)
 *
 * Revisa que exista, que sea del propósito que se espera, que lo haya subido quien llama, que no sea de
 * otro documento y que R2 lo tenga con el tamaño y la suma declarados. Ligarlo otra vez al mismo documento
 * no hace nada.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import { ErrorDeApi, errorDeRegla } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { loSubio } from "../dominio/archivos.ts";
import { archivos, propositosDeArchivo } from "../tablas.ts";

/** Lo que recibe. */
const pedido = z.object({
	archivo_id: z.uuid(),
	proposito: z.enum(propositosDeArchivo),
	modulo: z.string().min(1),
	entidad: z.string().min(1),
	entidad_id: z.uuid(),
});

/**
 * Liga el archivo al documento.
 * @param contexto El contexto de la acción que recibe el `archivo_id`.
 * @param datos El archivo, el propósito que espera y el documento.
 * @throws `404 archivo_no_existe`; `422 proposito_distinto`, `archivo_ajeno`, `archivo_ya_ligado` o
 * `archivo_no_subido`.
 */
export async function ligarArchivo(contexto: ContextoDeAccion, datos: unknown): Promise<undefined> {
	const ligar = pedido.parse(datos);
	const [archivo] = await contexto.transaccion
		.select()
		.from(archivos)
		.where(eq(archivos.id, ligar.archivo_id))
		.for("update");
	if (archivo === undefined || archivo.bajaEn !== null) throw new ErrorDeApi("no_existe", "archivo_no_existe");
	if (archivo.proposito !== ligar.proposito) {
		throw errorDeRegla("proposito_distinto", `Ese archivo no es ${ligar.proposito.replaceAll("_", " ")}.`);
	}
	if (!loSubio(contexto.quien, archivo)) throw errorDeRegla("archivo_ajeno", "Ese archivo lo subió otra cuenta.");
	if (archivo.entidadId !== null) {
		if (archivo.entidad === ligar.entidad && archivo.entidadId === ligar.entidad_id) return undefined;
		throw errorDeRegla("archivo_ya_ligado", "Ese archivo ya es de otro documento.");
	}
	if (contexto.almacen === undefined) throw new Error("no hay almacén de archivos para revisar la subida");
	const guardado = await contexto.almacen.revisar(archivo.almacenClave);
	if (guardado === undefined || guardado.tamano !== archivo.tamanoBytes || guardado.sha256 !== archivo.sha256) {
		throw errorDeRegla("archivo_no_subido", "El archivo no terminó de subir. Vuelve a subirlo.");
	}
	await contexto.transaccion
		.update(archivos)
		.set({
			modulo: ligar.modulo,
			entidad: ligar.entidad,
			entidadId: ligar.entidad_id,
			subidoEn: contexto.ahora.toString(),
		})
		.where(eq(archivos.id, archivo.id));
	return undefined;
}
