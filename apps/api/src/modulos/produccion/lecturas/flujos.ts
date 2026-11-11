/**
 * `produccion.flujo_vigente`: si un flujo existe y no está dado de baja.
 * Fase 12 · docs/modulos/produccion/operaciones-y-flujos.md («`produccion.flujo_vigente(flujo)`»)
 *
 * La usa Catálogo al dar de alta un producto, cambiar su flujo o guardar el flujo de un tipo de prenda. Lo lee con
 * `FOR SHARE`: mientras Catálogo no confirme, el flujo no se da de baja.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { flujos } from "../tablas.ts";

/** Lo que recibe. */
const pedido = z.object({ flujo_id: z.uuid() });

/**
 * Si el flujo existe y no está dado de baja.
 * @param contexto El contexto de quien lee.
 * @param datos `flujo_id`.
 * @returns `vigente` y, si existe, su nombre.
 */
export async function flujoVigente(contexto: ContextoDeAccion, datos: unknown) {
	const { flujo_id } = pedido.parse(datos);
	const [flujo] = await contexto.transaccion
		.select({ nombre: flujos.nombre, bajaEn: flujos.bajaEn })
		.from(flujos)
		.where(eq(flujos.id, flujo_id))
		.for("share");
	return { vigente: flujo !== undefined && flujo.bajaEn === null, nombre: flujo?.nombre ?? null };
}
