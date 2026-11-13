/**
 * `admin.ve_documento`: si quien llama puede ver un documento de `admin`, para abrir sus archivos.
 * Fase 4 · docs/modulos/admin/archivos.md (regla 7) y docs/modulos/admin/respaldos.md («Permisos»)
 *
 * Hoy el único documento de `admin` con archivo es la prueba de restauración (su evidencia), que ve
 * quien tiene Administración del sistema. Cualquier otro, nadie.
 */

import { z } from "zod";
import { tieneDepartamento } from "../../../nucleo/acceso/quien.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";

/** Lo que recibe. */
const documento = z.object({ entidad: z.string(), entidad_id: z.uuid() });

/**
 * Dice si quien llama ve el documento.
 * @param contexto El contexto de quien abre el archivo.
 * @param datos `entidad` y `entidad_id`.
 */
export async function veDocumento(contexto: ContextoDeAccion, datos: unknown): Promise<boolean> {
	const { entidad } = documento.parse(datos);
	const { quien } = contexto;
	return entidad === "restauraciones_probadas" && tieneDepartamento(quien, "admin");
}
