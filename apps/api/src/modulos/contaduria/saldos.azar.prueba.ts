/**
 * Prueba al azar de los saldos de las cuentas por cobrar: con pagos, notas de crédito, saldo a favor y cancelaciones al
 * azar, varios a la vez, el saldo guardado de cada cuenta es su importe menos sus aplicaciones vigentes y nunca sale de 0
 * al importe, y el saldo a favor del cliente nunca queda negativo.
 * Fase 15 · docs/fases/15-contaduria-terceros-credito-y-cobranza.md («Criterios de terminado»)
 */

import fc from "fast-check";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { crearBase } from "../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../nucleo/pruebas/accion-de-prueba.ts";
import {
	type ClienteDePrueba,
	clienteDePrueba,
	type NotaDePrueba,
	notaEntregadaDePrueba,
	pagarDePrueba,
	saldoAFavorDePrueba,
} from "../../nucleo/pruebas/contaduria-de-prueba.ts";
import { conGoogle, mandarAccion } from "../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../nucleo/pruebas/servidor-de-prueba.ts";

/** Una operación al azar sobre las notas de un cliente. */
const operacion = fc.oneof(
	fc.record({ tipo: fc.constant("pago" as const), nota: fc.nat(2), pesos: fc.integer({ min: 1, max: 6_000 }) }),
	fc.record({ tipo: fc.constant("nc" as const), nota: fc.nat(2), pesos: fc.integer({ min: 1, max: 3_000 }) }),
	fc.record({ tipo: fc.constant("favor" as const), nota: fc.nat(2), pesos: fc.integer({ min: 1, max: 2_000 }) }),
	fc.record({ tipo: fc.constant("devolver" as const), pesos: fc.integer({ min: 1, max: 2_000 }) }),
	fc.record({ tipo: fc.constant("cancelar" as const), pago: fc.nat(20) }),
);

/** Una de esas operaciones. */
type Operacion = typeof operacion extends fc.Arbitrary<infer T> ? T : never;

describe("Con pagos, notas de crédito y cancelaciones al azar, cada saldo es su importe menos sus aplicaciones vigentes", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Hace una operación; lo que no entra (saldo de más, ya cancelado, un choque de versión) se ignora. */
	async function hacer(cliente: ClienteDePrueba, notas: NotaDePrueba[], pagos: string[], op: Operacion) {
		const nota = "nota" in op ? notas[op.nota] : undefined;
		if (op.tipo === "pago" && nota !== undefined) {
			const respuesta = await pagarDePrueba(servidor, cliente, nota, op.pesos * 100);
			const hecho = z.object({ pago_id: z.uuid() }).safeParse(respuesta.cuerpo.resultado);
			if (hecho.success) pagos.push(hecho.data.pago_id);
			return;
		}
		if (op.tipo === "nc" && nota !== undefined) {
			await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
				contexto.interna("contaduria.aplicar_nota_credito", {
					nota_credito_id: uuidv7(),
					nota_entrega_id: nota.notaId,
					monto_centavos: op.pesos * 100,
				}),
			);
			return;
		}
		if (op.tipo === "favor" && nota !== undefined) {
			await mandarAccion(
				servidor,
				"contaduria.aplicar_saldo_a_favor",
				{ datos: { cliente_id: cliente.clienteId, nota_entrega_id: nota.notaId, monto_centavos: op.pesos * 100 } },
				"contaduria",
			);
			return;
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
			return;
		}
		const pagoId = op.tipo === "cancelar" ? pagos[op.pago % Math.max(1, pagos.length)] : undefined;
		if (pagoId === undefined) return;
		const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM pagos WHERE id = $1", [pagoId]);
		await mandarAccion(
			servidor,
			"contaduria.cancelar_pago",
			{ datos: { pago_id: pagoId, motivo: "Prueba al azar" }, version: rows[0]?.v },
			"contaduria",
			conGoogle(),
		);
	}

	it("con tandas de tres operaciones a la vez, ningún saldo sale de su lugar y el saldo a favor nunca es negativo", async () => {
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
					const pagos: string[] = [];
					for (const tanda of tandas) {
						await Promise.all(tanda.map((op) => hacer(cliente, notas, pagos, op)));
					}
					const { rows } = await servidor.base.dueno.query(
						`SELECT c.id, c.importe_centavos::int AS importe, c.saldo_centavos::int AS saldo, c.estado,
						c.pagada_en IS NOT NULL AS con_pagada_en,
						coalesce((SELECT sum(a.monto_centavos) FROM aplicaciones_pago a
							WHERE a.cuenta_por_cobrar_id = c.id AND a.estado = 'vigente'), 0)::int AS aplicado
					 FROM cuentas_por_cobrar c WHERE c.cliente_id = $1`,
						[cliente.clienteId],
					);
					expect(await saldoAFavorDePrueba(servidor, cliente.clienteId)).toBeGreaterThanOrEqual(0);
					for (const cuenta of rows) {
						expect(cuenta.saldo).toBe(cuenta.importe - cuenta.aplicado);
						expect(cuenta.saldo).toBeGreaterThanOrEqual(0);
						expect(cuenta.saldo).toBeLessThanOrEqual(cuenta.importe);
						const estado =
							cuenta.saldo === 0 ? "pagada" : cuenta.saldo === cuenta.importe ? "sin_pagar" : "pagada_en_parte";
						expect([cuenta.estado, cuenta.con_pagada_en]).toEqual([estado, estado === "pagada"]);
					}
				},
			),
			{ numRuns: 12 },
		);
	});
});
