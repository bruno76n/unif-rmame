/**
 * Prueba al azar de los saldos de Contaduría: con pagos, notas de crédito (con centavos), saldo a favor, anticipos y
 * cancelaciones al azar, varios a la vez, el saldo guardado de cada cuenta es su importe menos sus aplicaciones vigentes
 * y nunca sale de 0 al importe, el saldo a favor y el disponible del anticipo nunca quedan negativos, ninguna acción
 * falla con un error del servidor y Postgres no deshace ninguna traba.
 * Fase 15 · docs/fases/15-contaduria-terceros-credito-y-cobranza.md («Criterios de terminado»)
 */

import fc from "fast-check";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
	type AnticipoDePrueba,
	anticipoRecibidoDePrueba,
	type ClienteDePrueba,
	clienteDePrueba,
	internaDeContaduria,
	type NotaDePrueba,
	notaEntregadaDePrueba,
	pagarDePrueba,
	saldoAFavorDePrueba,
} from "../../nucleo/pruebas/contaduria-de-prueba.ts";
import { trabasDeLaBase } from "../../nucleo/pruebas/inventario-de-prueba.ts";
import { conGoogle, mandarAccion } from "../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../nucleo/pruebas/servidor-de-prueba.ts";

/** Una operación al azar sobre las notas, el pedido y el saldo a favor de un cliente. */
const operacion = fc.oneof(
	fc.record({ tipo: fc.constant("pago" as const), nota: fc.nat(2), pesos: fc.integer({ min: 1, max: 6_000 }) }),
	fc.record({ tipo: fc.constant("nc" as const), nota: fc.nat(2), centavos: fc.integer({ min: 1, max: 300_000 }) }),
	fc.record({ tipo: fc.constant("favor" as const), nota: fc.nat(2), centavos: fc.integer({ min: 1, max: 200_000 }) }),
	fc.record({ tipo: fc.constant("devolver" as const), pesos: fc.integer({ min: 1, max: 2_000 }) }),
	fc.record({ tipo: fc.constant("anticipo" as const), pesos: fc.integer({ min: 1, max: 3_000 }) }),
	fc.record({ tipo: fc.constant("pasar" as const) }),
	fc.record({ tipo: fc.constant("cancelar" as const), pago: fc.nat(20) }),
);

/** Una de esas operaciones. */
type Operacion = typeof operacion extends fc.Arbitrary<infer T> ? T : never;

/** Lo que una prueba tiene a la mano: el cliente, sus notas, su pedido con anticipo y los pagos que se pueden cancelar. */
interface Escenario {
	cliente: ClienteDePrueba;
	notas: NotaDePrueba[];
	anticipo: AnticipoDePrueba;
	pagos: string[];
}

describe("Con pagos, notas de crédito, saldo a favor y cancelaciones al azar, ningún saldo sale de su lugar", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una respuesta de acción: bien, o un error de regla o de campo; nunca un error del servidor. */
	function revisar(respuesta: { estado: number; cuerpo: Record<string, unknown> }) {
		expect([200, 400, 409, 422]).toContain(respuesta.estado);
		return respuesta.estado === 200;
	}

	/** Una respuesta de interna: lo que regresó o un error de regla; nunca otra cosa (las demás rechazan). */
	function revisarInterna(resultado: unknown) {
		const fallo = z.object({ codigo: z.string() }).safeParse(resultado);
		if (fallo.success) expect(["nota_credito_ya_aplicada", "anticipo_insuficiente"]).toContain(fallo.data.codigo);
		return !fallo.success;
	}

	/**
	 * Hace una operación; lo que no entra (saldo de más, ya cancelado, un choque de versión) es válido.
	 * @returns Si entró.
	 */
	async function hacer(escenario: Escenario, op: Operacion): Promise<boolean> {
		const { cliente, notas, anticipo, pagos } = escenario;
		const nota = "nota" in op ? notas[op.nota] : undefined;
		if (op.tipo === "pago" && nota !== undefined) {
			const respuesta = await pagarDePrueba(servidor, cliente, nota, op.pesos * 100);
			const hecho = z.object({ pago_id: z.uuid() }).safeParse(respuesta.cuerpo.resultado);
			if (hecho.success) pagos.push(hecho.data.pago_id);
			return revisar(respuesta);
		}
		if (op.tipo === "nc" && nota !== undefined) {
			return revisarInterna(
				await internaDeContaduria(servidor, "aplicar_nota_credito", {
					nota_credito_id: uuidv7(),
					nota_entrega_id: nota.notaId,
					monto_centavos: op.centavos,
				}),
			);
		}
		if (op.tipo === "favor" && nota !== undefined) {
			return revisar(
				await mandarAccion(
					servidor,
					"contaduria.aplicar_saldo_a_favor",
					{ datos: { cliente_id: cliente.clienteId, nota_entrega_id: nota.notaId, monto_centavos: op.centavos } },
					"contaduria",
				),
			);
		}
		if (op.tipo === "devolver") {
			const respuesta = await mandarAccion(
				servidor,
				"contaduria.devolver_saldo_a_favor",
				{
					datos: {
						cliente_id: cliente.clienteId,
						monto_centavos: op.pesos * 100,
						medio: "efectivo",
						referencia: "Prueba al azar",
					},
				},
				"contaduria",
				conGoogle(),
			);
			const hecho = z.object({ pago_id: z.uuid() }).safeParse(respuesta.cuerpo.resultado);
			if (hecho.success) pagos.push(hecho.data.pago_id);
			return revisar(respuesta);
		}
		if (op.tipo === "anticipo") {
			return revisarInterna(
				await internaDeContaduria(servidor, "aplicar_anticipo_a_nota", {
					pedido_id: anticipo.pedidoId,
					cliente_id: cliente.clienteId,
					nota_entrega_id: uuidv7(),
					monto_centavos: op.pesos * 100,
				}),
			);
		}
		if (op.tipo === "pasar") {
			return revisarInterna(
				await internaDeContaduria(servidor, "pasar_anticipo_a_favor", {
					pedido_id: anticipo.pedidoId,
					causa: "pedido_entregado",
				}),
			);
		}
		const pagoId = op.tipo === "cancelar" ? pagos[op.pago % Math.max(1, pagos.length)] : undefined;
		if (pagoId === undefined) return false;
		const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM pagos WHERE id = $1", [pagoId]);
		return revisar(
			await mandarAccion(
				servidor,
				"contaduria.cancelar_pago",
				{ datos: { pago_id: pagoId, motivo: "Prueba al azar" }, version: rows[0]?.v },
				"contaduria",
				conGoogle(),
			),
		);
	}

	it("con tandas de tres operaciones a la vez, ningún saldo sale de su lugar, nada falla y nada se traba", async () => {
		const trabasAntes = await trabasDeLaBase(servidor);
		let entraron = 0;
		await fc.assert(
			fc.asyncProperty(
				fc.array(fc.array(operacion, { minLength: 1, maxLength: 3 }), { minLength: 2, maxLength: 5 }),
				async (tandas) => {
					const cliente = await clienteDePrueba(servidor);
					const notas = [
						await notaEntregadaDePrueba(servidor, cliente, { totalCentavos: 500_000 }),
						await notaEntregadaDePrueba(servidor, cliente, { totalCentavos: 1_200_000 }),
						await notaEntregadaDePrueba(servidor, cliente, { totalCentavos: 80_000 }),
					];
					const anticipo = await anticipoRecibidoDePrueba(servidor, cliente, 400_000);
					const otro = await anticipoRecibidoDePrueba(servidor, cliente, 150_000, anticipo.pedidoId);
					const escenario = { cliente, notas, anticipo, pagos: [anticipo.pagoId, otro.pagoId] };
					for (const tanda of tandas) {
						const hechas = await Promise.all(tanda.map((op) => hacer(escenario, op)));
						entraron += hechas.filter(Boolean).length;
					}
					const { rows } = await servidor.base.dueno.query(
						`SELECT c.id, c.importe_centavos::int AS importe, c.saldo_centavos::int AS saldo, c.estado,
							c.pagada_en IS NOT NULL AS con_pagada_en,
							coalesce((SELECT sum(a.monto_centavos) FROM aplicaciones_pago a
								WHERE a.cuenta_por_cobrar_id = c.id AND a.estado = 'vigente'), 0)::int AS aplicado
						 FROM cuentas_por_cobrar c WHERE c.cliente_id = $1`,
						[cliente.clienteId],
					);
					for (const cuenta of rows) {
						expect(cuenta.saldo).toBe(cuenta.importe - cuenta.aplicado);
						expect(cuenta.saldo).toBeGreaterThanOrEqual(0);
						expect(cuenta.saldo).toBeLessThanOrEqual(cuenta.importe);
						const estado =
							cuenta.saldo === 0 ? "pagada" : cuenta.saldo === cuenta.importe ? "sin_pagar" : "pagada_en_parte";
						expect([cuenta.estado, cuenta.con_pagada_en]).toEqual([estado, estado === "pagada"]);
					}
					expect(await saldoAFavorDePrueba(servidor, cliente.clienteId)).toBeGreaterThanOrEqual(0);
					const { rows: disponible } = await servidor.base.dueno.query(
						`SELECT coalesce(sum(CASE WHEN tipo IN ('recibido', 'regresado') THEN monto_centavos ELSE -monto_centavos END), 0)::int AS d
						 FROM anticipos WHERE pedido_id = $1 AND estado = 'vigente'`,
						[anticipo.pedidoId],
					);
					expect(disponible[0]?.d).toBeGreaterThanOrEqual(0);
				},
			),
			{ numRuns: 25 },
		);
		// No pasó en vacío: entraron operaciones de verdad.
		expect(entraron).toBeGreaterThan(25);
		expect(await trabasDeLaBase(servidor)).toBe(trabasAntes);
	});
});
