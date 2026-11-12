/**
 * Prueba de las tres puntas de una factura de varias órdenes: lo recibido de más en una orden no cubre lo que falta
 * en otra, y «Pagar lo recibido» nunca pasa del total de la factura.
 * Fase 17 · docs/fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md (criterio «La factura que no cuadra
 * detiene su pago»); decisión 716
 */

import { describe, expect, it } from "vitest";
import { montoLoRecibido, tresPuntas } from "./facturas.ts";

describe("La factura que no cuadra detiene su pago, también con varias órdenes", () => {
	it("lo que llegó de más en una orden no cubre lo que falta en otra; lo recibido toma de cada orden hasta lo facturado", () => {
		const resultado = tresPuntas(2_000_000, [
			{ ordenCompraId: "a", importe: 1_000_000, valor: 1_500_000, sinRecepcion: false },
			{ ordenCompraId: "b", importe: 1_000_000, valor: 500_000, sinRecepcion: false },
		]);
		expect(resultado).toEqual({
			estado: "detenida",
			responsable: "contaduria",
			motivo: "La factura dice $20,000 sin IVA y lo recibido suma $15,000",
			valorRecibido: 1_500_000,
		});
		// «Pagar lo recibido»: lo recibido más su IVA proporcional, sin pasar del total.
		const monto = montoLoRecibido({
			subtotalCentavos: 2_000_000,
			ivaCentavos: 320_000,
			valorRecibidoCentavos: resultado.valorRecibido,
		});
		expect(monto).toBe(1_740_000);
		expect(monto).toBeLessThanOrEqual(2_320_000);
	});

	it("con lo de más en las dos órdenes, cuadra y lo recibido es lo facturado", () => {
		expect(
			tresPuntas(2_000_000, [
				{ ordenCompraId: "a", importe: 1_000_000, valor: 1_200_000, sinRecepcion: false },
				{ ordenCompraId: "b", importe: 1_000_000, valor: 1_000_000, sinRecepcion: false },
			]),
		).toEqual({ estado: "conciliada", responsable: null, motivo: null, valorRecibido: 2_000_000 });
	});
});
