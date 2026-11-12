/**
 * Prueba de cancelar una factura de proveedor: con pagos no se cancela; sin pagos, se cancela con su cuenta y se
 * revisan las facturas que se capturaron después para sus órdenes; si con ella cancelada las demás de la orden están
 * pagadas, la orden se cierra.
 * Fase 17 · docs/fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md (criterio «Una factura con pagos no se
 * cancela»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ordenParaRecibir } from "../../../nucleo/pruebas/aduana-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import {
	facturaComoQuedo,
	facturaDePrueba,
	ivaDe,
	pagarCuentaDePrueba,
	recibirOrden,
	versionPorPagar,
} from "../../../nucleo/pruebas/por-pagar-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Una factura con pagos no se cancela; sin pagos, se cancela con su cuenta y se revisan las de después", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Contaduría cancela una factura. */
	async function cancelar(facturaId: string, motivo = "El proveedor la mandó con otro folio") {
		return mandarAccion(
			servidor,
			"contaduria.cancelar_factura_proveedor",
			{
				datos: { factura_proveedor_id: facturaId, motivo },
				version: await versionPorPagar(servidor, "facturas_proveedor", facturaId),
			},
			"contaduria",
		);
	}

	it("Una factura con pagos no se cancela", async () => {
		const factura = await facturaDePrueba(servidor);
		expect((await pagarCuentaDePrueba(servidor, factura.cuentaId, 100_000)).estado).toBe(200);
		expect((await cancelar(factura.id)).cuerpo).toMatchObject({
			codigo: "factura_con_pagos",
			mensaje: `${factura.folio} ya tiene pagos: no se puede cancelar.`,
		});
	});

	it("sin pagos, se cancela con su cuenta; la que se capturó después para su orden queda conciliada", async () => {
		const orden = await ordenParaRecibir(servidor);
		await recibirOrden(servidor, orden);
		const primera = await facturaDePrueba(servidor, { orden });
		const despues = await facturaDePrueba(servidor, { orden, subtotal: 100_000 });
		expect(despues.estado).toBe("detenida");
		expect((await cancelar(primera.id, "no")).estado).toBe(400);
		expect((await cancelar(primera.id)).cuerpo.resultado).toMatchObject({ mensaje: `${primera.folio} cancelada` });
		expect(await facturaComoQuedo(servidor, primera.id)).toMatchObject({ estado: "cancelada", cuenta: "cancelada" });
		expect(await facturaComoQuedo(servidor, despues.id)).toMatchObject({ estado: "conciliada", cuenta: "por_pagar" });
		expect((await cancelar(primera.id)).cuerpo).toMatchObject({ codigo: "factura_no_cancelable" });
	});

	it("una factura que espera a Dirección no se cancela", async () => {
		const factura = await facturaDePrueba(servidor, { metros: 80 });
		await mandarAccion(
			servidor,
			"contaduria.pedir_pago_lo_recibido",
			{
				datos: { factura_proveedor_id: factura.id },
				version: await versionPorPagar(servidor, "facturas_proveedor", factura.id),
			},
			"contaduria",
		);
		expect((await cancelar(factura.id)).cuerpo).toMatchObject({
			codigo: "factura_no_cancelable",
			mensaje: "Solo se cancela una factura detenida o lista para pagar.",
		});
	});

	it("al cancelar la última factura sin pagar de una orden recibida, con las demás pagadas, la orden se cierra (decisión 716)", async () => {
		const orden = await ordenParaRecibir(servidor);
		await recibirOrden(servidor, orden);
		const pagada = await facturaDePrueba(servidor, { orden, subtotal: 400_000 });
		const sinPagar = await facturaDePrueba(servidor, { orden, subtotal: 399_000 });
		expect((await pagarCuentaDePrueba(servidor, pagada.cuentaId, 400_000 + ivaDe(400_000))).estado).toBe(200);
		const estadoDeLaOrden = async () =>
			(await servidor.base.dueno.query("SELECT estado FROM ordenes_compra WHERE id = $1", [orden.id])).rows;
		expect(await estadoDeLaOrden()).toEqual([{ estado: "recibida" }]);
		expect((await cancelar(sinPagar.id)).estado).toBe(200);
		expect(await estadoDeLaOrden()).toEqual([{ estado: "cerrada" }]);
	});
});
