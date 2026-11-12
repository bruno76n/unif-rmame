/**
 * `contaduria.estado_pago_notas` y `contaduria.saldo_por_cobrar_de_cliente`: lo que Ventas lee de las cuentas por
 * cobrar. El saldo solo sale a quien tiene Contaduría: a Ventas, el estado de pago y si el cliente debe.
 * Fase 15 · docs/modulos/contaduria/cuentas-por-cobrar.md (regla 6, «Lecturas»)
 */

import { and, eq, inArray, sum } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { cuentasPorCobrar } from "../tablas.ts";

/**
 * Si quien lee ve montos: la dueña o una cuenta con Contaduría.
 * @param contexto El contexto de quien lee.
 */
function veMontos(contexto: ContextoDeAccion): boolean {
	const { quien } = contexto;
	return quien.tipo === "cuenta" && (quien.esDuena || quien.departamentos.includes("contaduria"));
}

/** Lo que pide `estado_pago_notas`. */
const pedidoDeNotas = z.object({ nota_entrega_ids: z.array(z.uuid()) }).strict();

/**
 * El estado de pago de unas notas: sin pagar, pagada en parte o pagada. Una nota sin cuenta (por entregar) no sale.
 * @param contexto El contexto de quien lee.
 * @param datos Las notas.
 * @returns Por nota, su estado y, a quien tiene Contaduría, su saldo.
 */
export async function estadoPagoNotas(contexto: ContextoDeAccion, datos: unknown) {
	const { nota_entrega_ids } = pedidoDeNotas.parse(datos);
	if (nota_entrega_ids.length === 0) return { notas: [] };
	const cuentas = await contexto.transaccion
		.select({
			notaEntregaId: cuentasPorCobrar.notaEntregaId,
			estado: cuentasPorCobrar.estado,
			saldoCentavos: cuentasPorCobrar.saldoCentavos,
		})
		.from(cuentasPorCobrar)
		.where(inArray(cuentasPorCobrar.notaEntregaId, nota_entrega_ids));
	const conSaldo = veMontos(contexto);
	return {
		notas: cuentas.map((cuenta) => ({
			nota_entrega_id: cuenta.notaEntregaId,
			estado: cuenta.estado,
			...(conSaldo ? { saldo_centavos: cuenta.saldoCentavos } : {}),
		})),
	};
}

/** Lo que pide `saldo_por_cobrar_de_cliente`. */
const pedidoDeCliente = z.object({ cliente_id: z.uuid() }).strict();

/**
 * Lo que un cliente debe: la suma de los saldos de sus cuentas por cobrar.
 * @param contexto El contexto de quien lee.
 * @param datos El cliente.
 * @returns Si debe algo y, a quien tiene Contaduría, cuánto.
 */
export async function saldoPorCobrarDeCliente(contexto: ContextoDeAccion, datos: unknown) {
	const { cliente_id } = pedidoDeCliente.parse(datos);
	const [suma] = await contexto.transaccion
		.select({ saldo: sum(cuentasPorCobrar.saldoCentavos).mapWith(Number) })
		.from(cuentasPorCobrar)
		.where(
			and(
				eq(cuentasPorCobrar.clienteId, cliente_id),
				inArray(cuentasPorCobrar.estado, ["sin_pagar", "pagada_en_parte"]),
			),
		);
	const saldo = suma?.saldo ?? 0;
	return { con_saldo: saldo > 0, ...(veMontos(contexto) ? { saldo_centavos: saldo } : {}) };
}
