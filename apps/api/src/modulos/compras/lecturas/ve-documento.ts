/**
 * `compras.ve_documento`: si quien llama puede ver un documento de `compras`, para abrir sus archivos.
 * Fase 19 · docs/modulos/admin/archivos.md (regla 7) y docs/interfaz/fabrica/compras.md (el cajón de la orden)
 *
 * El único documento de `compras` con archivo es la orden de compra (su PDF, con sus precios): lo ven Compras y
 * Contaduría. Aduana también lee las órdenes para recibirlas, pero sin precios, así que no abre su PDF; la cuenta de
 * soporte tampoco, aunque tenga Compras: nunca recibe un monto, y el PDF no pasa por el recorte común.
 */

import { z } from "zod";
import { tieneDepartamento } from "../../../nucleo/acceso/quien.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";

/** Lo que recibe. */
const documento = z.object({ entidad: z.string(), entidad_id: z.uuid() });

/**
 * Dice si quien llama ve el documento.
 * @param contexto Quién abre el archivo (de su contexto, solo se usa eso).
 * @param datos `entidad` y `entidad_id`.
 */
export async function veDocumento(contexto: Pick<ContextoDeAccion, "quien">, datos: unknown): Promise<boolean> {
	const { entidad } = documento.parse(datos);
	const { quien } = contexto;
	const esSoporte = quien.tipo === "cuenta" && quien.esSoporte;
	return entidad === "ordenes_compra" && !esSoporte && tieneDepartamento(quien, "compras", "contaduria");
}
