/**
 * `admin.datos_de_archivo`: el tipo y el tamaño de un archivo subido, para que el módulo que lo recibe revise
 * sus propios topes antes de ligarlo (la foto de un producto, más chica que la de un gasto).
 * Fase 8 · docs/modulos/admin/archivos.md (regla de los topes por módulo) y docs/modulos/catalogo/productos.md
 * («`catalogo.subir_foto_producto`»)
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import { ErrorDeApi } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { archivos } from "../tablas.ts";

/** Lo que recibe. */
const pedido = z.object({ archivo_id: z.uuid() });

/**
 * El tipo y el tamaño del archivo.
 * @param contexto El contexto de la acción.
 * @param datos `archivo_id`.
 * @returns `tipo_mime` y `tamano_bytes`.
 * @throws `404 archivo_no_existe` si no existe o está de baja.
 */
export async function datosDeArchivo(contexto: ContextoDeAccion, datos: unknown) {
	const { archivo_id } = pedido.parse(datos);
	const [archivo] = await contexto.transaccion
		.select({ tipoMime: archivos.tipoMime, tamanoBytes: archivos.tamanoBytes, bajaEn: archivos.bajaEn })
		.from(archivos)
		.where(eq(archivos.id, archivo_id));
	if (archivo === undefined || archivo.bajaEn !== null) throw new ErrorDeApi("no_existe", "archivo_no_existe");
	return { tipo_mime: archivo.tipoMime, tamano_bytes: archivo.tamanoBytes };
}
