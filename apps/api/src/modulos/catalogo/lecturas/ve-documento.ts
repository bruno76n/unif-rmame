/**
 * `catalogo.ve_documento`: si quien llama puede ver un documento de `catalogo`, para abrir sus archivos.
 * Fase 19 · docs/modulos/admin/archivos.md (regla 7) y docs/interfaz/fabrica/catalogo.md («Ficha del producto»)
 *
 * El único documento de `catalogo` con archivo es el producto (su foto de referencia): la ve quien lee los productos.
 */

import { z } from "zod";
import { tieneDepartamento } from "../../../nucleo/acceso/quien.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { lectoresDeCatalogo } from "../permisos.ts";

/** Lo que recibe. */
const documento = z.object({ entidad: z.string(), entidad_id: z.uuid() });

/**
 * Dice si quien llama ve el documento.
 * @param contexto El contexto de quien abre el archivo.
 * @param datos `entidad` y `entidad_id`.
 */
export async function veDocumento(contexto: ContextoDeAccion, datos: unknown): Promise<boolean> {
	const { entidad } = documento.parse(datos);
	return entidad === "productos" && tieneDepartamento(contexto.quien, ...(lectoresDeCatalogo.productos ?? []));
}
