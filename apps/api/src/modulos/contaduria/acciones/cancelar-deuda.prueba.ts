/**
 * Prueba de cancelar una deuda: solo sin pagos, con sus cuentas por pagar.
 * Fase 17 · docs/fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md (criterio «Una deuda … solo se cancela sin
 * pagos»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import {
	cuentaPorPagarComoQuedo,
	deudaDePrueba,
	pagarCuentaDePrueba,
} from "../../../nucleo/pruebas/por-pagar-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Una deuda solo se cancela sin pagos", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Contaduría cancela una deuda con su versión de ahora. */
	async function cancelar(deudaId: string) {
		const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM deudas WHERE id = $1", [deudaId]);
		return mandarAccion(
			servidor,
			"contaduria.cancelar_deuda",
			{ datos: { deuda_id: deudaId, motivo: "Se registró dos veces" }, version: rows[0]?.v },
			"contaduria",
		);
	}

	it("Una deuda sin pagos se cancela con sus cuentas por pagar", async () => {
		const deuda = await deudaDePrueba(servidor, { totalCentavos: 300_000, mensualidades: 3 });
		expect((await cancelar(deuda.id)).cuerpo.resultado).toMatchObject({ mensaje: `${deuda.folio} cancelada` });
		for (const cuenta of deuda.cuentas) {
			expect(await cuentaPorPagarComoQuedo(servidor, cuenta)).toMatchObject({ estado: "cancelada" });
		}
		expect((await cancelar(deuda.id)).cuerpo).toMatchObject({
			codigo: "deuda_no_abierta",
			mensaje: `${deuda.folio} ya está saldada o cancelada.`,
		});
		// Una cuenta cancelada no se paga.
		expect((await pagarCuentaDePrueba(servidor, deuda.cuentas[0] ?? "", 100_000)).cuerpo).toMatchObject({
			codigo: "cuenta_cancelada",
		});
	});

	it("Una deuda con un pago no se cancela", async () => {
		const deuda = await deudaDePrueba(servidor, { totalCentavos: 300_000, mensualidades: 3 });
		expect((await pagarCuentaDePrueba(servidor, deuda.cuentas[1] ?? "", 50_000)).estado).toBe(200);
		expect((await cancelar(deuda.id)).cuerpo).toMatchObject({
			codigo: "deuda_con_pagos",
			mensaje: `${deuda.folio} ya tiene pagos: no se puede cancelar.`,
		});
	});
});
