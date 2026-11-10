/**
 * `admin.correo_de_cuenta`: el correo de Google de una cuenta activa, para mandarle sus avisos por correo.
 * Fase 5 · docs/modulos/admin/avisos.md («Cómo está hecho»)
 *
 * A una cuenta que ya no tiene acceso no se le manda nada: no da su correo.
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { usuarios } from "../tablas.ts";

/** Lo que recibe. */
const pedido = z.object({ usuario_id: z.uuid() });

/**
 * El correo de la cuenta.
 * @param contexto El contexto de la acción.
 * @param datos `usuario_id`.
 * @returns El correo, o `undefined` si la cuenta no existe o no está activa.
 */
export async function correoDeCuenta(contexto: ContextoDeAccion, datos: unknown): Promise<string | undefined> {
	const [cuenta] = await contexto.transaccion
		.select({ correo: usuarios.correo })
		.from(usuarios)
		.where(and(eq(usuarios.id, pedido.parse(datos).usuario_id), eq(usuarios.estado, "activa")));
	return cuenta?.correo;
}
