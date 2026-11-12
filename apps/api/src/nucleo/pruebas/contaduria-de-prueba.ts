/**
 * Las ayudas de las pruebas de Contaduría: un cliente de prueba con su tercero y su crédito, la versión de su crédito,
 * una cuenta por cobrar escrita directo en la base o nacida de una nota entregada de prueba, registrar un pago, un
 * anticipo recibido en un pedido de prueba y el saldo a favor de un cliente.
 * Fase 15 · docs/fases/15-contaduria-terceros-credito-y-cobranza.md («Cómo se construye»)
 *
 * El cliente es su renglón de Ventas, con su tercero real y su crédito abierto con la interna que llama
 * `ventas.crear_cliente`.
 */

import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { ErrorDeApi } from "../http/errores.ts";
import { llamarInterna } from "./inventario-de-prueba.ts";
import { mandarAccion } from "./llamadas.ts";
import type { ServidorDePrueba } from "./servidor-de-prueba.ts";
import { notaDePrueba, pedidoDePrueba, renglonDeClienteDePrueba } from "./ventas-de-prueba.ts";

/** Un cliente de prueba: su id, su tercero, su crédito y su nombre. */
export interface ClienteDePrueba {
	clienteId: string;
	terceroId: string;
	creditoId: string;
	nombre: string;
}

/**
 * Da de alta un cliente de prueba: su tercero, con un nombre que nadie más tiene, y su crédito.
 * @param servidor El servidor de prueba.
 * @param opciones Su tipo (mayorista si no se dice) y su límite en centavos (0 si no se dice), escrito directo.
 */
export async function clienteDePrueba(
	servidor: ServidorDePrueba,
	opciones: { tipo?: "escuela" | "mayorista" | "empresa_otro"; limiteCentavos?: number } = {},
): Promise<ClienteDePrueba> {
	const { clienteId, terceroId, nombre } = await renglonDeClienteDePrueba(servidor, opciones.tipo ?? "mayorista");
	const { credito_cliente_id: creditoId } = z.object({ credito_cliente_id: z.uuid() }).parse(
		await llamarInterna(servidor, "contaduria.abrir_credito_cliente", {
			cliente_id: clienteId,
			tercero_id: terceroId,
			tipo_cliente: opciones.tipo ?? "mayorista",
		}),
	);
	if (opciones.limiteCentavos !== undefined) {
		await servidor.base.dueno.query("UPDATE credito_clientes SET limite_centavos = $1 WHERE id = $2", [
			opciones.limiteCentavos,
			creditoId,
		]);
	}
	return { clienteId, terceroId, creditoId, nombre };
}

/**
 * La versión del crédito de un cliente.
 * @param servidor El servidor de prueba.
 * @param clienteId El cliente.
 */
export async function versionDelCredito(servidor: ServidorDePrueba, clienteId: string): Promise<number> {
	const { rows } = await servidor.base.dueno.query(
		"SELECT version::int AS v FROM credito_clientes WHERE cliente_id = $1",
		[clienteId],
	);
	return z.number().parse(rows[0]?.v);
}

/**
 * Escribe directo una cuenta por cobrar del cliente con su saldo y su vencimiento, sin pagos: para lo que solo lee
 * saldos.
 * @param servidor El servidor de prueba.
 * @param cliente El cliente.
 * @param cuenta Su importe y su saldo en centavos, y a cuántos días de hoy vence (negativo: ya venció).
 */
export async function cuentaEscritaDePrueba(
	servidor: ServidorDePrueba,
	cliente: ClienteDePrueba,
	cuenta: { importeCentavos: number; saldoCentavos: number; venceEnDias: number },
): Promise<string> {
	const id = uuidv7();
	const nota = await notaDePrueba(servidor, { clienteId: cliente.clienteId, subtotalCentavos: cuenta.importeCentavos });
	const estado =
		cuenta.saldoCentavos === 0
			? "pagada"
			: cuenta.saldoCentavos === cuenta.importeCentavos
				? "sin_pagar"
				: "pagada_en_parte";
	await servidor.base.dueno.query(
		`INSERT INTO cuentas_por_cobrar (id, nota_entrega_id, pedido_id, cliente_id, tercero_id, fecha_entrega, dias_credito,
			vence, total_nota_centavos, importe_centavos, saldo_centavos, estado, pagada_en)
		 VALUES ($1, $9, $8, $2, $3, (now() AT TIME ZONE 'America/Mexico_City')::date + $4::int,
			0, (now() AT TIME ZONE 'America/Mexico_City')::date + $4::int, $5, $5, $6, $7,
			CASE WHEN $7 = 'pagada' THEN now() END)`,
		[
			id,
			cliente.clienteId,
			cliente.terceroId,
			cuenta.venceEnDias,
			cuenta.importeCentavos,
			cuenta.saldoCentavos,
			estado,
			nota.pedidoId,
			nota.notaId,
		],
	);
	return id;
}

/** Una nota entregada de prueba con su cuenta por cobrar. */
export interface NotaDePrueba {
	notaId: string;
	pedidoId: string;
	cuentaId: string;
	folio: string;
}

/** El último número de las NV- de prueba (`NV-T0001`): las de la muestra llevan los del contador. */
let ultimaNota = 0;

/**
 * Una nota de prueba del cliente, escrita directo con su folio NV-, y su cuenta por cobrar creada con la interna que
 * Ventas llama al confirmar la entrega.
 * @param servidor El servidor de prueba.
 * @param cliente El cliente.
 * @param nota El total de la nota en centavos y, si no se dice, 0 días de crédito y entregada hoy.
 */
export async function notaEntregadaDePrueba(
	servidor: ServidorDePrueba,
	cliente: ClienteDePrueba,
	nota: { totalCentavos: number; diasCredito?: number; fechaEntrega?: string },
): Promise<NotaDePrueba> {
	ultimaNota += 1;
	const { notaId, pedidoId, folio } = await notaDePrueba(servidor, {
		clienteId: cliente.clienteId,
		folio: `NV-T${String(ultimaNota).padStart(4, "0")}`,
		// Una nota siempre vale algo; la cuenta en 0 es la que su anticipo cubrió toda.
		subtotalCentavos: Math.max(nota.totalCentavos, 100),
	});
	const { cuenta_por_cobrar_id: cuentaId } = z.object({ cuenta_por_cobrar_id: z.uuid() }).parse(
		await llamarInterna(servidor, "contaduria.crear_cuenta_por_cobrar", {
			nota_entrega_id: notaId,
			pedido_id: pedidoId,
			cliente_id: cliente.clienteId,
			fecha_entrega: nota.fechaEntrega ?? Temporal.Now.plainDateISO("America/Mexico_City").toString(),
			dias_credito: nota.diasCredito ?? 0,
			total_nota_centavos: nota.totalCentavos,
		}),
	);
	return { notaId, pedidoId, cuentaId, folio };
}

/**
 * Contaduría registra un pago en efectivo a una nota.
 * @param servidor El servidor de prueba.
 * @param cliente El cliente que paga.
 * @param nota La nota.
 * @param montoCentavos El monto.
 * @param datos Lo demás del pago (el medio, la referencia), si no es en efectivo.
 * @param quien La cuenta que lo registra: Contaduría si no se dice.
 */
export function pagarDePrueba(
	servidor: ServidorDePrueba,
	cliente: ClienteDePrueba,
	nota: NotaDePrueba,
	montoCentavos: number,
	datos: Record<string, unknown> = { medio: "efectivo" },
	quien = "contaduria",
) {
	return mandarAccion(
		servidor,
		"contaduria.registrar_pago_recibido",
		{ datos: { cliente_id: cliente.clienteId, nota_entrega_id: nota.notaId, monto_centavos: montoCentavos, ...datos } },
		quien,
	);
}

/**
 * Una cuenta por cobrar como quedó: su saldo y su estado, y si tiene `pagada_en`.
 * @param servidor El servidor de prueba.
 * @param cuentaId La cuenta.
 */
export async function cuentaComoQuedo(servidor: ServidorDePrueba, cuentaId: string) {
	const { rows } = await servidor.base.dueno.query(
		`SELECT saldo_centavos::int AS saldo, estado, pagada_en IS NOT NULL AS con_pagada_en
		 FROM cuentas_por_cobrar WHERE id = $1`,
		[cuentaId],
	);
	return rows[0];
}

/** Un pedido de prueba con un anticipo recibido: el pedido, su pago y su folio. */
export interface AnticipoDePrueba {
	pedidoId: string;
	pagoId: string;
	folio: string;
}

/**
 * Escribe directo un anticipo recibido en un pedido de prueba: el pago `recibido` al pedido y su renglón `recibido`.
 * El pago a un pedido llega en la fase 16; hasta entonces, la prueba lo escribe como lo escribirá «Registrar pago».
 * @param servidor El servidor de prueba.
 * @param cliente El cliente.
 * @param montoCentavos El anticipo, en pesos enteros.
 * @param pedidoIdDado El pedido; uno nuevo del cliente si no se dice.
 */
export async function anticipoRecibidoDePrueba(
	servidor: ServidorDePrueba,
	cliente: ClienteDePrueba,
	montoCentavos: number,
	pedidoIdDado?: string,
): Promise<AnticipoDePrueba> {
	const pedidoId = pedidoIdDado ?? (await pedidoDePrueba(servidor, cliente.clienteId));
	const pagoId = uuidv7();
	const folio = `PG-P${pagoId.slice(-8)}`;
	await servidor.base.dueno.query(
		`INSERT INTO pagos (id, folio, direccion, concepto, fecha, tercero_id, cliente_id, pedido_id, monto_centavos, medio)
		 VALUES ($1, $2, 'recibido', 'pedido', (now() AT TIME ZONE 'America/Mexico_City')::date, $3, $4, $5, $6, 'efectivo')`,
		[pagoId, folio, cliente.terceroId, cliente.clienteId, pedidoId, montoCentavos],
	);
	await servidor.base.dueno.query(
		`INSERT INTO anticipos (id, pedido_id, cliente_id, tipo, monto_centavos, fecha, pago_id)
		 VALUES ($1, $2, $3, 'recibido', $4, (now() AT TIME ZONE 'America/Mexico_City')::date, $5)`,
		[uuidv7(), pedidoId, cliente.clienteId, montoCentavos, pagoId],
	);
	return { pedidoId, pagoId, folio };
}

/**
 * El saldo a favor vigente de un cliente.
 * @param servidor El servidor de prueba.
 * @param clienteId El cliente.
 */
export async function saldoAFavorDePrueba(servidor: ServidorDePrueba, clienteId: string): Promise<number> {
	const { rows } = await servidor.base.dueno.query(
		`SELECT coalesce(sum(CASE WHEN tipo = 'entra' THEN monto_centavos ELSE -monto_centavos END), 0)::int AS saldo
		 FROM saldo_favor_movimientos WHERE cliente_id = $1 AND estado = 'vigente'`,
		[clienteId],
	);
	return z.number().parse(rows[0]?.saldo);
}

/**
 * Llama una interna de Contaduría en su propia transacción; regresa lo que regresó o el cuerpo de su error.
 * @param servidor El servidor de prueba.
 * @param nombre La interna, sin el módulo (`aplicar_anticipo_a_nota`).
 * @param datos Lo que recibe.
 */
export function internaDeContaduria(servidor: ServidorDePrueba, nombre: string, datos: unknown): Promise<unknown> {
	return llamarInterna(servidor, `contaduria.${nombre}`, datos).catch((error: unknown) =>
		error instanceof ErrorDeApi ? error.cuerpo() : Promise.reject(error),
	);
}
