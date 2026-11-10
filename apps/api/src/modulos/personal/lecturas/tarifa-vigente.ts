/**
 * `personal.tarifa_vigente`: la tarifa de una operación del flujo en el momento en que pasó un registro.
 * Fase 7 · docs/modulos/personal/tarifas.md (regla 3, «`personal.tarifa_vigente`»)
 *
 * La usa Producción al recibir un registro de la tablet (fase 12): el registro congela la tarifa que tenía.
 */

import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { tarifasOperacion } from "../tablas.ts";

/** Lo que recibe. */
const pedido = z.object({ flujo_operacion_id: z.uuid(), en: z.iso.datetime({ offset: true }) });

/**
 * La tarifa vigente en ese momento.
 * @param contexto El contexto de la acción.
 * @param datos `flujo_operacion_id` y `en`.
 * @returns `tarifa_operacion_id` y `tarifa_centavos`, o `null` si no tenía («Sin tarifa»).
 */
export async function tarifaVigente(contexto: ContextoDeAccion, datos: unknown) {
	const { flujo_operacion_id, en } = pedido.parse(datos);
	const [vigente] = await contexto.transaccion
		.select({ tarifa_operacion_id: tarifasOperacion.id, tarifa_centavos: tarifasOperacion.tarifaCentavos })
		.from(tarifasOperacion)
		.where(
			and(
				eq(tarifasOperacion.flujoOperacionId, flujo_operacion_id),
				lte(tarifasOperacion.vigenteDesde, en),
				or(isNull(tarifasOperacion.vigenteHasta), gt(tarifasOperacion.vigenteHasta, en)),
			),
		)
		.orderBy(desc(tarifasOperacion.vigenteDesde))
		.limit(1);
	return vigente ?? null;
}
