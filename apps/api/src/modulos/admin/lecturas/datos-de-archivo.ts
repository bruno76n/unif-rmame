/**
 * `admin.datos_de_archivo`: el tipo, el tamaño, el nombre y la clave en el almacén de un archivo subido, para que el
 * módulo que lo recibe revise sus propios topes antes de ligarlo (la foto de un producto, más chica que la de un
 * gasto), o lo lea para armar otro (el ZIP del paquete del contador).
 * Fase 8 · docs/modulos/admin/archivos.md (regla de los topes por módulo) y docs/modulos/catalogo/productos.md
 * («`catalogo.subir_foto_producto`»)
 * Fase 18 · el nombre y la clave, para los documentos y el paquete del contador
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import { ErrorDeApi } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { archivos } from "../tablas.ts";

/** Lo que recibe. */
const pedido = z.object({ archivo_id: z.uuid() });

/**
 * El tipo, el tamaño, el nombre y la clave del archivo.
 * @param contexto El contexto de la acción.
 * @param datos `archivo_id`.
 * @returns `tipo_mime`, `tamano_bytes`, `nombre_original` y `almacen_clave`.
 * @throws `404 archivo_no_existe` si no existe o está de baja.
 */
export async function datosDeArchivo(contexto: ContextoDeAccion, datos: unknown) {
	const { archivo_id } = pedido.parse(datos);
	const [archivo] = await contexto.transaccion
		.select({
			tipoMime: archivos.tipoMime,
			tamanoBytes: archivos.tamanoBytes,
			nombreOriginal: archivos.nombreOriginal,
			almacenClave: archivos.almacenClave,
			bajaEn: archivos.bajaEn,
		})
		.from(archivos)
		.where(eq(archivos.id, archivo_id));
	if (archivo === undefined || archivo.bajaEn !== null) throw new ErrorDeApi("no_existe", "archivo_no_existe");
	return {
		tipo_mime: archivo.tipoMime,
		tamano_bytes: archivo.tamanoBytes,
		nombre_original: archivo.nombreOriginal,
		almacen_clave: archivo.almacenClave,
	};
}
