/**
 * Prueba de pagar una cuenta por pagar: vence con los días de crédito menores de sus órdenes, una detenida no se paga,
 * pide «Confirmar con Google», nunca pasa del saldo aun con dos pagos al mismo tiempo, y la orden se cierra cuando
 * todas sus facturas quedan pagadas.
 * Fase 17 · docs/fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md (criterios «La cuenta por pagar vence con
 * los días de crédito menores» y «Pagar pide "Confirmar con Google" y nunca pasa del saldo»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ordenParaRecibir } from "../../../nucleo/pruebas/aduana-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import {
	capturarDePrueba,
	facturaComoQuedo,
	facturaDePrueba,
	pagarCuentaDePrueba,
	recibirOrden,
} from "../../../nucleo/pruebas/por-pagar-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("La cuenta por pagar vence con sus órdenes, una detenida no se paga, y pagar pide Google, no pasa del saldo y cierra la orden pagada", () => {
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

	/** El estado de una orden. */
	async function estadoDeOrden(id: string) {
		const [orden] = await consultar("SELECT estado, cerrada_por FROM ordenes_compra WHERE id = $1", [id]);
		return orden;
	}

	it("La cuenta por pagar vence con los días de crédito de su orden; una detenida no se paga", async () => {
		const factura = await facturaDePrueba(servidor, { metros: 0, piezas: 0 });
		const [dias] = await consultar("SELECT (fecha + 30)::text AS vence FROM cuentas_por_pagar WHERE id = $1", [
			factura.cuentaId,
		]);
		expect(await facturaComoQuedo(servidor, factura.id)).toMatchObject({ cuenta: "detenida", vence: dias?.vence });
		expect((await pagarCuentaDePrueba(servidor, factura.cuentaId, 100_000)).cuerpo).toMatchObject({
			codigo: "cuenta_detenida",
			mensaje: "Este pago está detenido: orden, recepción y factura no coinciden.",
		});
	});

	it("Pagar pide «Confirmar con Google»: un PG- emitido con su aplicación; por partes hasta el saldo, y con centavos solo el saldo exacto", async () => {
		const factura = await facturaDePrueba(servidor);
		const total = 799_000 + 127_840;
		expect((await pagarCuentaDePrueba(servidor, factura.cuentaId, 100_000, {})).estado).toBe(401);
		const pago = await pagarCuentaDePrueba(servidor, factura.cuentaId, 100_000);
		expect(pago.cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(/^\$1,000 pagados a /),
			saldo_centavos: total - 100_000,
		});
		const [emitido] = await consultar(
			`SELECT p.direccion, p.concepto, p.confirmado_con_google_en IS NOT NULL AS con_google, a.monto_centavos::int AS monto
			 FROM pagos p JOIN aplicaciones_pago a ON a.pago_id = p.id WHERE a.cuenta_por_pagar_id = $1`,
			[factura.cuentaId],
		);
		expect(emitido).toEqual({ direccion: "emitido", concepto: "cuenta_por_pagar", con_google: true, monto: 100_000 });
		expect(await facturaComoQuedo(servidor, factura.id)).toMatchObject({
			cuenta: "pagada_en_parte",
			saldo: total - 100_000,
		});
		expect((await pagarCuentaDePrueba(servidor, factura.cuentaId, total)).cuerpo).toMatchObject({
			campos: { monto_centavos: "Hasta $8,268.40" },
		});
		expect((await pagarCuentaDePrueba(servidor, factura.cuentaId, 50_050)).estado).toBe(400);
		expect((await pagarCuentaDePrueba(servidor, factura.cuentaId, total - 100_000)).estado).toBe(200);
		expect(await facturaComoQuedo(servidor, factura.id)).toMatchObject({ cuenta: "pagada", saldo: 0 });
		expect((await pagarCuentaDePrueba(servidor, factura.cuentaId, 100)).cuerpo).toMatchObject({
			codigo: "cuenta_pagada",
			mensaje: `${factura.folio} ya está pagada.`,
		});
		// Aduana no paga.
		const deAduana = await mandarAccion(
			servidor,
			"contaduria.pagar_cuenta_por_pagar",
			{
				datos: { cuenta_por_pagar_id: factura.cuentaId, monto_centavos: 100, medio: "efectivo", referencia: "R-1" },
				version: 1,
			},
			"aduana",
		);
		expect(deAduana.estado).toBe(403);
	});

	it("dos pagos al mismo tiempo nunca pasan del saldo", async () => {
		const factura = await facturaDePrueba(servidor);
		const [uno, dos] = await Promise.all([
			pagarCuentaDePrueba(servidor, factura.cuentaId, 600_000),
			pagarCuentaDePrueba(servidor, factura.cuentaId, 600_000),
		]);
		// El segundo choca con la versión (409) o, si ya la leyó nueva, con el saldo (400): nunca pagan los dos.
		const estados = [uno.estado, dos.estado].sort();
		expect(estados[0]).toBe(200);
		expect([400, 409]).toContain(estados[1]);
		expect(await facturaComoQuedo(servidor, factura.id)).toMatchObject({ saldo: 926_840 - 600_000 });
	});

	it("la orden se cierra cuando todas sus facturas quedan pagadas, aunque se paguen dos a la vez", async () => {
		const orden = await ordenParaRecibir(servidor);
		await recibirOrden(servidor, orden);
		const cuentas: string[] = [];
		for (const subtotal of [500_000, 299_000]) {
			const captura = await capturarDePrueba(servidor, {
				ordenes: [{ orden_compra_id: orden.id }],
				subtotal_centavos: subtotal,
			});
			const { factura_proveedor_id: id } = captura.cuerpo.resultado as { factura_proveedor_id: string };
			const [cuenta] = await consultar(
				"SELECT id, importe_centavos::int AS importe FROM cuentas_por_pagar WHERE factura_proveedor_id = $1",
				[id],
			);
			cuentas.push(String(cuenta?.id));
		}
		const [primera, segunda] = cuentas;
		const importe = async (id: string | undefined) =>
			Number(
				(await consultar("SELECT importe_centavos FROM cuentas_por_pagar WHERE id = $1", [id]))[0]?.importe_centavos,
			);
		const pagos = await Promise.all([
			pagarCuentaDePrueba(servidor, primera ?? "", await importe(primera)),
			pagarCuentaDePrueba(servidor, segunda ?? "", await importe(segunda)),
		]);
		expect(pagos.map((pago) => pago.estado)).toEqual([200, 200]);
		expect(await estadoDeOrden(orden.id)).toEqual({ estado: "cerrada", cerrada_por: null });
	});

	it("una orden con una factura sin pagar sigue recibida", async () => {
		const orden = await ordenParaRecibir(servidor);
		await recibirOrden(servidor, orden);
		const pagada = await facturaDePrueba(servidor, { orden, subtotal: 500_000 });
		await facturaDePrueba(servidor, { orden, subtotal: 299_000 });
		expect((await pagarCuentaDePrueba(servidor, pagada.cuentaId, 580_000)).estado).toBe(200);
		expect(await estadoDeOrden(orden.id)).toEqual({ estado: "recibida", cerrada_por: null });
	});
});
