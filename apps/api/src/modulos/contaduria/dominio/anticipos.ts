/**
 * El libro de anticipos de un pedido: su candado, su disponible, pasarlo a favor del cliente y lo que cancelar un pago
 * cancela de su anticipo.
 * Fase 15 · docs/modulos/contaduria/anticipos.md (reglas 1, 2, 5 y 6) y
 * docs/modulos/contaduria/pagos-y-saldo-a-favor.md (regla 5)
 *
 * El disponible es lo recibido + lo regresado − lo aplicado − lo que pasó a favor, de los renglones vigentes. Quien lo
 * cambia toma antes el candado del anticipo de ese pedido: así nunca queda negativo. En el orden de los candados del
 * dinero (`dominio/cuentas.ts`) va después del pago que se cancela y antes del crédito del cliente.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { anticipos, saldoFavorMovimientos } from "../tablas.ts";
import { creditoDelCliente } from "./credito.ts";
import { bloquearSaldoAFavor, entrarAFavor, saldoAFavor } from "./saldo-favor.ts";

/**
 * Toma el candado del anticipo de un pedido hasta el final de la transacción.
 * @param transaccion La transacción.
 * @param pedidoId El pedido.
 */
export async function candadoDeAnticipo(transaccion: Transaccion, pedidoId: string): Promise<void> {
	await transaccion.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`anticipo:${pedidoId}`}, 0))`);
}

/** El anticipo de un pedido, por tipo de renglón, y su disponible. */
export interface AnticipoDelPedido {
	recibido: number;
	aplicado: number;
	regresado: number;
	aFavor: number;
	disponible: number;
}

/**
 * El anticipo de un pedido, con sus renglones vigentes.
 * @param transaccion La transacción.
 * @param pedidoId El pedido.
 */
export async function anticipoDelPedido(transaccion: Transaccion, pedidoId: string): Promise<AnticipoDelPedido> {
	const filas = await transaccion
		.select({ tipo: anticipos.tipo, monto: sql<string>`sum(${anticipos.montoCentavos})` })
		.from(anticipos)
		.where(and(eq(anticipos.pedidoId, pedidoId), eq(anticipos.estado, "vigente")))
		.groupBy(anticipos.tipo);
	const de = (tipo: string) =>
		Number(
			z
				.string()
				.optional()
				.parse(filas.find((fila) => fila.tipo === tipo)?.monto) ?? 0,
		);
	const recibido = de("recibido");
	const aplicado = de("aplicado");
	const regresado = de("regresado");
	const aFavor = de("a_favor");
	return { recibido, aplicado, regresado, aFavor, disponible: recibido + regresado - aplicado - aFavor };
}

/**
 * Pasa a favor todo el disponible de un pedido: el renglón `a_favor` y su movimiento `entra`. Quien la llama ya tiene
 * el candado del anticipo del pedido.
 * @param contexto El contexto de la acción.
 * @param pedidoId El pedido.
 * @returns Lo que pasó a favor; 0 si no había disponible.
 */
export async function pasarDisponibleAFavor(contexto: ContextoDeAccion, pedidoId: string): Promise<number> {
	const { transaccion } = contexto;
	const { disponible } = await anticipoDelPedido(transaccion, pedidoId);
	if (disponible <= 0) return 0;
	const [recibido] = await transaccion
		.select({ clienteId: anticipos.clienteId })
		.from(anticipos)
		.where(and(eq(anticipos.pedidoId, pedidoId), eq(anticipos.tipo, "recibido")))
		.limit(1);
	if (recibido === undefined) throw new Error(`el pedido ${pedidoId} tiene disponible sin nada recibido`);
	const credito = await creditoDelCliente(transaccion, recibido.clienteId);
	await transaccion.insert(anticipos).values({
		id: uuidv7(),
		pedidoId,
		clienteId: recibido.clienteId,
		tipo: "a_favor",
		montoCentavos: disponible,
		fecha: contexto.diaDeNegocio.toString(),
		creadoPor: quienCambia(contexto),
	});
	await entrarAFavor(contexto, {
		clienteId: recibido.clienteId,
		terceroId: credito.terceroId,
		montoCentavos: disponible,
		origen: { tipo: "anticipo_pedido", pedidoId },
	});
	return disponible;
}

/** El pago que se cancela, como lo necesita su anticipo. */
interface PagoQueSeCancela {
	id: string;
	folio: string;
	clienteId: string | null;
}

/**
 * Cancela lo que un pago dejó en el anticipo de su pedido: su renglón `recibido`. Si el pedido ya pasó su anticipo a
 * favor, cancela también ese `a_favor` y su `entra` (si nadie ha usado ese saldo a favor) y vuelve a pasar a favor lo
 * que quede. Toma el candado del anticipo y, si cancela saldo a favor, el del crédito del cliente.
 * @param contexto El contexto de `contaduria.cancelar_pago`.
 * @param pago El pago.
 * @param motivo El motivo de la cancelación.
 * @returns Lo que se canceló del anticipo y lo que se canceló a favor, en centavos.
 * @throws `422 anticipo_ya_aplicado` si el disponible del pedido quedaría negativo; `422 saldo_a_favor_ya_usado` si lo
 * que dejó a favor ya se usó.
 */
export async function cancelarAnticipoDelPago(
	contexto: ContextoDeAccion,
	pago: PagoQueSeCancela,
	motivo: string,
): Promise<{ anticipo_centavos: number; a_favor_centavos: number }> {
	const { transaccion } = contexto;
	const recibidos = await transaccion
		.select({ id: anticipos.id, pedidoId: anticipos.pedidoId, monto: anticipos.montoCentavos })
		.from(anticipos)
		.where(and(eq(anticipos.pagoId, pago.id), eq(anticipos.estado, "vigente")));
	const [primero] = recibidos;
	if (primero === undefined) return { anticipo_centavos: 0, a_favor_centavos: 0 };
	const pedidoId = primero.pedidoId;
	const monto = recibidos.reduce((suma, recibido) => suma + recibido.monto, 0);
	await candadoDeAnticipo(transaccion, pedidoId);
	const cancelado = {
		canceladoEn: contexto.ahora.toString(),
		canceladoPor: quienCambia(contexto),
		motivoCancelacion: motivo,
	};
	let { disponible, aFavor } = await anticipoDelPedido(transaccion, pedidoId);
	// Lo que el pedido pasó a favor regresa al pedido, si nadie lo ha usado.
	let regresoDeFavor = 0;
	if (disponible < monto && aFavor > 0) {
		if (pago.clienteId === null) throw new Error(`el pago ${pago.id} recibido no tiene cliente`);
		await bloquearSaldoAFavor(transaccion, pago.clienteId);
		if ((await saldoAFavor(transaccion, pago.clienteId)) < aFavor) {
			throw errorDeRegla(
				"saldo_a_favor_ya_usado",
				`Lo que dejó ${pago.folio} a favor ya se usó: ya no se puede cancelar.`,
			);
		}
		await transaccion
			.update(anticipos)
			.set({ estado: "cancelado", ...cancelado })
			.where(and(eq(anticipos.pedidoId, pedidoId), eq(anticipos.tipo, "a_favor"), eq(anticipos.estado, "vigente")));
		await transaccion
			.update(saldoFavorMovimientos)
			.set({ estado: "cancelado", ...cancelado })
			.where(
				and(
					eq(saldoFavorMovimientos.pedidoId, pedidoId),
					eq(saldoFavorMovimientos.origen, "anticipo_pedido"),
					eq(saldoFavorMovimientos.estado, "vigente"),
				),
			);
		regresoDeFavor = aFavor;
		disponible += aFavor;
		aFavor = 0;
	}
	if (disponible < monto) {
		throw errorDeRegla(
			"anticipo_ya_aplicado",
			`El anticipo de ${pago.folio} ya se aplicó a una nota: ya no se puede cancelar.`,
		);
	}
	await transaccion
		.update(anticipos)
		.set({ estado: "cancelado", ...cancelado })
		.where(
			inArray(
				anticipos.id,
				recibidos.map((recibido) => recibido.id),
			),
		);
	// Lo que el pedido ya había pasado a favor, menos este pago, vuelve a quedar a favor.
	const otraVezAFavor = regresoDeFavor > 0 ? await pasarDisponibleAFavor(contexto, pedidoId) : 0;
	return { anticipo_centavos: monto, a_favor_centavos: regresoDeFavor - otraVezAFavor };
}
