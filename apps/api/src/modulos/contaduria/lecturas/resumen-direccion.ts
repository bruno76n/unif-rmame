/**
 * `contaduria.resumen_direccion`: lo que Dirección ve de las cuentas: el saldo por cobrar y lo vencido; el saldo por
 * pagar (con las detenidas) y lo vencido (sin ellas); y el cliente que más debe, con su parte y lo que tiene vencido de
 * más de `dias_vencido` días.
 * Fase 18 · docs/modulos/contaduria/contador-y-cuadres.md («Lecturas») y docs/modulos/direccion/alertas-e-indicadores.md
 */

import { sql } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";

/** Lo que recibe. */
const pedido = z.object({ dias_vencido: z.number().int().nonnegative() }).strict();

/** Una fila de números. */
const numeros = z.record(z.string(), z.coerce.number().nullable());

/**
 * El resumen de las cuentas para Dirección.
 * @param contexto El contexto de quien lee (el trabajo de las alertas de Dirección).
 * @param datos `dias_vencido`: desde cuántos días vencido cuenta para la alerta de concentración.
 */
export async function resumenDireccion(contexto: ContextoDeAccion, datos: unknown) {
	const { dias_vencido } = pedido.parse(datos);
	const hoy = contexto.diaDeNegocio.toString();
	const limite = contexto.diaDeNegocio.subtract({ days: dias_vencido }).toString();
	const { rows: totales } = await contexto.transaccion.execute(sql`
		SELECT
			(SELECT coalesce(sum(saldo_centavos), 0) FROM cuentas_por_cobrar WHERE estado <> 'pagada') AS por_cobrar,
			(SELECT coalesce(sum(saldo_centavos), 0) FROM cuentas_por_cobrar WHERE estado <> 'pagada' AND vence < ${hoy}::date) AS por_cobrar_vencido,
			(SELECT coalesce(sum(saldo_centavos), 0) FROM cuentas_por_pagar WHERE estado IN ('detenida', 'por_pagar', 'pagada_en_parte')) AS por_pagar,
			(SELECT coalesce(sum(saldo_centavos), 0) FROM cuentas_por_pagar
				WHERE estado IN ('por_pagar', 'pagada_en_parte') AND vence < ${hoy}::date) AS por_pagar_vencido`);
	const total = numeros.parse(totales[0]);
	// El cliente que más debe, con lo que tiene vencido de más de `dias_vencido` días.
	const { rows: mayores } = await contexto.transaccion.execute(sql`
		SELECT c.cliente_id, t.nombre, sum(c.saldo_centavos) AS saldo,
			coalesce(sum(c.saldo_centavos) FILTER (WHERE c.vence < ${limite}::date), 0) AS vencido
		FROM cuentas_por_cobrar c JOIN terceros t ON t.id = c.tercero_id
		WHERE c.estado <> 'pagada' GROUP BY c.cliente_id, t.nombre ORDER BY saldo DESC, c.cliente_id LIMIT 1`);
	const mayor = z
		.object({ cliente_id: z.uuid(), nombre: z.string(), saldo: z.coerce.number(), vencido: z.coerce.number() })
		.optional()
		.parse(mayores[0]);
	const porCobrar = total.por_cobrar ?? 0;
	return {
		por_cobrar_centavos: porCobrar,
		por_cobrar_vencido_centavos: total.por_cobrar_vencido ?? 0,
		por_pagar_centavos: total.por_pagar ?? 0,
		por_pagar_vencido_centavos: total.por_pagar_vencido ?? 0,
		cliente_que_mas_debe:
			mayor === undefined
				? null
				: {
						cliente_id: mayor.cliente_id,
						nombre: mayor.nombre,
						saldo_centavos: mayor.saldo,
						// Su parte del total por cobrar, en milésimas (300 es el 30 %).
						parte_milesimas: porCobrar === 0 ? 0 : Math.round((mayor.saldo * 1000) / porCobrar),
						vencido_centavos: mayor.vencido,
					},
	};
}
