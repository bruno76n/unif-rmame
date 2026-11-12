/**
 * El saldo a favor de un cliente: cuánto tiene, el candado de su crédito y lo que entra.
 * Fase 15 · docs/modulos/contaduria/pagos-y-saldo-a-favor.md (reglas 6 a 9)
 *
 * El saldo a favor es lo que entra menos lo aplicado y lo devuelto, vigente. Quien lo baja (aplicarlo, devolverlo o
 * cancelar lo que entró) toma antes el renglón del crédito del cliente. Lo que entra no lo toma: solo sube el saldo, y
 * quien lo baja vuelve a leerlo con el candado.
 */

import { eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { creditoClientes, saldoFavorMovimientos } from "../tablas.ts";

/**
 * Bloquea el renglón del crédito del cliente: el candado de su saldo a favor.
 * @param transaccion La transacción.
 * @param clienteId El cliente.
 * @throws `404` si el cliente no tiene crédito.
 */
export async function bloquearSaldoAFavor(transaccion: Transaccion, clienteId: string): Promise<void> {
	const [credito] = await transaccion
		.select({ id: creditoClientes.id })
		.from(creditoClientes)
		.where(eq(creditoClientes.clienteId, clienteId))
		.for("update");
	if (credito === undefined) throw noExiste();
}

/**
 * El saldo a favor vigente de un cliente.
 * @param transaccion La transacción.
 * @param clienteId El cliente.
 */
export async function saldoAFavor(transaccion: Transaccion, clienteId: string): Promise<number> {
	const { rows } = await transaccion.execute(sql`
		SELECT coalesce(sum(CASE WHEN tipo = 'entra' THEN monto_centavos ELSE -monto_centavos END), 0)::text AS saldo
		FROM saldo_favor_movimientos WHERE cliente_id = ${clienteId} AND estado = 'vigente'`);
	return Number(z.object({ saldo: z.string() }).parse(rows[0]).saldo);
}

/** Lo que entra a favor de un cliente y de dónde. */
export interface EntradaAFavor {
	clienteId: string;
	terceroId: string;
	montoCentavos: number;
	origen: { tipo: "anticipo_pedido"; pedidoId: string } | { tipo: "nota_credito"; notaCreditoId: string };
}

/**
 * Escribe lo que entra a favor de un cliente, con su evento: sale en Pendientes de Contaduría.
 * @param contexto El contexto de la acción.
 * @param entrada El cliente, su tercero, el monto y su origen.
 * @returns El movimiento.
 */
export async function entrarAFavor(contexto: ContextoDeAccion, entrada: EntradaAFavor): Promise<string> {
	const id = uuidv7();
	await contexto.transaccion.insert(saldoFavorMovimientos).values({
		id,
		clienteId: entrada.clienteId,
		terceroId: entrada.terceroId,
		tipo: "entra",
		origen: entrada.origen.tipo,
		montoCentavos: entrada.montoCentavos,
		fecha: contexto.diaDeNegocio.toString(),
		pedidoId: entrada.origen.tipo === "anticipo_pedido" ? entrada.origen.pedidoId : null,
		notaCreditoId: entrada.origen.tipo === "nota_credito" ? entrada.origen.notaCreditoId : null,
		creadoPor: quienCambia(contexto),
	});
	contexto.guardarEvento({
		tipo: "saldo_favor.creado",
		datos: { movimiento_id: id, cliente_id: entrada.clienteId },
		tablas: ["saldo_favor_movimientos"],
		entidad: "saldo_favor_movimientos",
		entidadId: id,
	});
	return id;
}
