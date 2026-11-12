/**
 * Prueba al azar de los saldos por pagar: con pagos, depósitos a terceros, compensaciones y cancelaciones al azar,
 * varios a la vez, el saldo de cada cuenta por pagar es su importe menos sus aplicaciones vigentes, una orden está
 * cerrada solo si sus facturas están pagadas, una deuda está saldada solo si sus mensualidades lo están, ningún depósito
 * se aplica de más, nada falla con un error del servidor y Postgres no deshace ninguna traba.
 * Fase 17 · docs/fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md (criterio «Con pagos, depósitos,
 * compensaciones y cancelaciones al azar»)
 */

import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { ordenParaRecibir } from "../../nucleo/pruebas/aduana-de-prueba.ts";
import {
	type ClienteDePrueba,
	clienteDePrueba,
	type NotaDePrueba,
	notaEntregadaDePrueba,
	pagarDePrueba,
} from "../../nucleo/pruebas/contaduria-de-prueba.ts";
import { trabasDeLaBase } from "../../nucleo/pruebas/inventario-de-prueba.ts";
import { conGoogle, mandarAccion } from "../../nucleo/pruebas/llamadas.ts";
import {
	deudaDePrueba,
	facturaDePrueba,
	pagarCuentaDePrueba,
	recibirOrden,
} from "../../nucleo/pruebas/por-pagar-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../nucleo/pruebas/servidor-de-prueba.ts";

/** Una operación al azar sobre las cuentas por pagar de un escenario. */
const operacion = fc.oneof(
	fc.record({ tipo: fc.constant("pagar" as const), cuenta: fc.nat(3), pesos: fc.integer({ min: 1, max: 4_000 }) }),
	fc.record({ tipo: fc.constant("liquidar" as const), cuenta: fc.nat(3) }),
	fc.record({ tipo: fc.constant("deposito" as const), cuenta: fc.nat(1), pesos: fc.integer({ min: 1, max: 1_500 }) }),
	fc.record({ tipo: fc.constant("aplicar" as const), cuenta: fc.nat(1), pago: fc.nat(10) }),
	fc.record({ tipo: fc.constant("compensar" as const), pesos: fc.integer({ min: 1, max: 1_200 }) }),
	fc.record({ tipo: fc.constant("cancelar_pago" as const), pago: fc.nat(20) }),
	fc.record({ tipo: fc.constant("cancelar_compensacion" as const), compensacion: fc.nat(5) }),
);

/** Una de esas operaciones. */
type Operacion = typeof operacion extends fc.Arbitrary<infer T> ? T : never;

/** Lo que una vuelta tiene a la mano. */
interface Escenario {
	/** El cliente que también es acreedor: le debemos su deuda y nos debe su nota. */
	acreedor: ClienteDePrueba;
	/** El cliente que deposita a la cuenta del acreedor, y su nota. */
	cliente: ClienteDePrueba;
	nota: NotaDePrueba;
	/** Las dos mensualidades de la deuda y las cuentas de las dos facturas de la misma orden. */
	cuentas: string[];
	ordenId: string;
	deudaId: string;
	pagos: string[];
	depositos: string[];
	compensaciones: string[];
}

describe("Con pagos, depósitos, compensaciones y cancelaciones al azar, ningún saldo por pagar sale de su lugar", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[]) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	/** Una respuesta de acción: bien, o un error de regla o de campo; nunca un error del servidor. */
	function revisar(respuesta: { estado: number; cuerpo: Record<string, unknown> }) {
		expect([200, 400, 409, 422]).toContain(respuesta.estado);
		return respuesta.estado === 200;
	}

	/** Guarda el pago que entró. */
	function guardarPago(lista: string[], respuesta: { cuerpo: Record<string, unknown> }) {
		const hecho = z.object({ pago_id: z.uuid() }).safeParse(respuesta.cuerpo.resultado);
		if (hecho.success) lista.push(hecho.data.pago_id);
	}

	/** Manda una acción con la versión de ahora de su registro. */
	async function conVersion(
		accion: string,
		tabla: "pagos" | "compensaciones",
		id: string,
		datos: Record<string, unknown>,
	) {
		const [fila] = await consultar(`SELECT version::int AS v FROM ${tabla} WHERE id = $1`, [id]);
		return mandarAccion(servidor, accion, { datos, version: fila?.v }, "contaduria", conGoogle());
	}

	/**
	 * Hace una operación; lo que no entra (de más, ya pagada, un choque de versión) es válido.
	 * @returns Si entró.
	 */
	async function hacer(escenario: Escenario, op: Operacion): Promise<boolean> {
		if (op.tipo === "pagar" || op.tipo === "liquidar") {
			const cuenta = escenario.cuentas[op.cuenta] ?? "";
			const [fila] = await consultar("SELECT saldo_centavos::int AS saldo FROM cuentas_por_pagar WHERE id = $1", [
				cuenta,
			]);
			const monto = op.tipo === "pagar" ? op.pesos * 100 : z.number().parse(fila?.saldo);
			if (monto === 0) return false;
			const respuesta = await pagarCuentaDePrueba(servidor, cuenta, monto);
			guardarPago(escenario.pagos, respuesta);
			return revisar(respuesta);
		}
		if (op.tipo === "deposito") {
			const respuesta = await pagarDePrueba(servidor, escenario.cliente, escenario.nota, op.pesos * 100, {
				medio: "cuenta_tercero",
				referencia: "Depósito al azar",
				tercero_deposito_id: escenario.acreedor.terceroId,
				aplicar: op.pesos % 2 === 0 ? "ahora" : "despues",
				...(op.pesos % 2 === 0 ? { cuenta_por_pagar_id: escenario.cuentas[op.cuenta] } : {}),
			});
			guardarPago(escenario.pagos, respuesta);
			guardarPago(escenario.depositos, respuesta);
			return revisar(respuesta);
		}
		if (op.tipo === "aplicar") {
			const pago = escenario.depositos[op.pago % Math.max(1, escenario.depositos.length)];
			if (pago === undefined) return false;
			return revisar(
				await conVersion("contaduria.aplicar_deposito_a_tercero", "pagos", pago, {
					pago_id: pago,
					cuenta_por_pagar_id: escenario.cuentas[op.cuenta],
				}),
			);
		}
		if (op.tipo === "compensar") {
			const respuesta = await mandarAccion(
				servidor,
				"contaduria.compensar",
				{ datos: { tercero_id: escenario.acreedor.terceroId, monto_centavos: op.pesos * 100 } },
				"contaduria",
			);
			const hecha = z.object({ compensacion_id: z.uuid() }).safeParse(respuesta.cuerpo.resultado);
			if (hecha.success) escenario.compensaciones.push(hecha.data.compensacion_id);
			return revisar(respuesta);
		}
		if (op.tipo === "cancelar_pago") {
			const pago = escenario.pagos[op.pago % Math.max(1, escenario.pagos.length)];
			if (pago === undefined) return false;
			return revisar(
				await conVersion("contaduria.cancelar_pago", "pagos", pago, { pago_id: pago, motivo: "Prueba al azar" }),
			);
		}
		const compensacion = escenario.compensaciones[op.compensacion % Math.max(1, escenario.compensaciones.length)];
		if (compensacion === undefined) return false;
		return revisar(
			await conVersion("contaduria.cancelar_compensacion", "compensaciones", compensacion, {
				compensacion_id: compensacion,
				motivo: "Prueba al azar",
			}),
		);
	}

	/** Un escenario nuevo: el acreedor con su nota y su deuda, el cliente que deposita y dos facturas de una orden. */
	async function escenarioNuevo(): Promise<Escenario> {
		const acreedor = await clienteDePrueba(servidor);
		await notaEntregadaDePrueba(servidor, acreedor, { totalCentavos: 150_000 });
		const deuda = await deudaDePrueba(servidor, {
			totalCentavos: 200_000,
			mensualidades: 2,
			terceroId: acreedor.terceroId,
		});
		const cliente = await clienteDePrueba(servidor);
		const nota = await notaEntregadaDePrueba(servidor, cliente, { totalCentavos: 5_000_000 });
		const orden = await ordenParaRecibir(servidor);
		await recibirOrden(servidor, orden);
		const una = await facturaDePrueba(servidor, { orden, subtotal: 200_000 });
		const otra = await facturaDePrueba(servidor, { orden, subtotal: 100_000 });
		return {
			acreedor,
			cliente,
			nota,
			cuentas: [...deuda.cuentas, una.cuentaId, otra.cuentaId],
			ordenId: orden.id,
			deudaId: deuda.id,
			pagos: [],
			depositos: [],
			compensaciones: [],
		};
	}

	/** Revisa que todo esté en su lugar después de las operaciones. */
	async function revisarSaldos(escenario: Escenario) {
		const cuentas = await consultar(
			`SELECT c.importe_centavos::int AS importe, c.saldo_centavos::int AS saldo, c.estado,
				c.pagada_en IS NOT NULL AS con_pagada_en,
				coalesce((SELECT sum(a.monto_centavos) FROM aplicaciones_pago a
					WHERE a.cuenta_por_pagar_id = c.id AND a.estado = 'vigente'), 0)::int AS aplicado
			 FROM cuentas_por_pagar c WHERE c.id = ANY($1::uuid[]) ORDER BY array_position($1::uuid[], c.id)`,
			[escenario.cuentas],
		);
		for (const cuenta of cuentas) {
			expect(cuenta.saldo).toBe(cuenta.importe - cuenta.aplicado);
			expect(cuenta.saldo).toBeGreaterThanOrEqual(0);
			const estado = cuenta.saldo === 0 ? "pagada" : cuenta.saldo === cuenta.importe ? "por_pagar" : "pagada_en_parte";
			expect([cuenta.estado, cuenta.con_pagada_en]).toEqual([estado, estado === "pagada"]);
		}
		const pagadas = cuentas.map((cuenta) => cuenta.estado === "pagada");
		const [orden] = await consultar("SELECT estado FROM ordenes_compra WHERE id = $1", [escenario.ordenId]);
		expect(orden?.estado === "cerrada").toBe(pagadas[2] === true && pagadas[3] === true);
		const [deuda] = await consultar(`SELECT d.estado FROM deudas d WHERE d.id = $1`, [escenario.deudaId]);
		const mensualidades = await consultar(
			`SELECT c.estado FROM cuentas_por_pagar c JOIN deuda_mensualidades m ON m.id = c.deuda_mensualidad_id
			 WHERE m.deuda_id = $1`,
			[escenario.deudaId],
		);
		expect(deuda?.estado === "saldada").toBe(mensualidades.every((fila) => fila.estado === "pagada"));
		// Ningún depósito se aplica de más.
		const depositos = await consultar(
			`SELECT p.monto_centavos::int AS monto,
				coalesce((SELECT sum(a.monto_centavos) FROM aplicaciones_pago a
					WHERE a.pago_id = p.id AND a.cuenta_por_pagar_id IS NOT NULL AND a.estado = 'vigente'), 0)::int AS aplicado
			 FROM pagos p WHERE p.id = ANY($1::uuid[])`,
			[escenario.depositos],
		);
		for (const deposito of depositos) expect(deposito.aplicado).toBeLessThanOrEqual(deposito.monto);
	}

	it("con tandas de tres operaciones a la vez, ningún saldo por pagar sale de su lugar, nada falla y nada se traba", async () => {
		const trabasAntes = await trabasDeLaBase(servidor);
		const entraron = new Map<string, number>();
		await fc.assert(
			fc.asyncProperty(
				fc.array(fc.array(operacion, { minLength: 1, maxLength: 3 }), { minLength: 2, maxLength: 5 }),
				async (tandas) => {
					const escenario = await escenarioNuevo();
					for (const tanda of tandas) {
						const hechas = await Promise.all(tanda.map((op) => hacer(escenario, op)));
						for (const [i, hecha] of hechas.entries()) {
							const tipo = tanda[i]?.tipo ?? "";
							if (hecha) entraron.set(tipo, (entraron.get(tipo) ?? 0) + 1);
						}
					}
					await revisarSaldos(escenario);
				},
			),
			{ numRuns: 30 },
		);
		// No pasó en vacío: de cada operación, alguna entró.
		for (const tipo of ["pagar", "liquidar", "deposito", "compensar", "cancelar_pago"]) {
			expect(entraron.get(tipo) ?? 0, tipo).toBeGreaterThan(0);
		}
		expect(await trabasDeLaBase(servidor)).toBe(trabasAntes);
	});
});
