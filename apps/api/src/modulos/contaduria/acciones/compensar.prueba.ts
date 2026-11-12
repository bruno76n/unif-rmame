/**
 * Prueba de compensar: lo que un tercero nos debe se descuenta de lo que le debemos, primero lo que vence antes, sin
 * las detenidas y hasta lo menor de los dos; y se cancela con «Confirmar con Google», regresando los saldos.
 * Fase 17 · docs/modulos/contaduria/terceros-y-deudas.md (regla 5, «`contaduria.compensar`» y
 * «`contaduria.cancelar_compensacion`»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cuentaComoQuedo } from "../../../nucleo/pruebas/contaduria-de-prueba.ts";
import { conGoogle, mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { clienteQueTambienEsAcreedor, cuentaPorPagarComoQuedo } from "../../../nucleo/pruebas/por-pagar-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Compensar descuenta lo que un tercero nos debe de lo que le debemos, y se cancela como un pago", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Contaduría compensa con un tercero. */
	function compensar(terceroId: string, monto: number) {
		return mandarAccion(
			servidor,
			"contaduria.compensar",
			{ datos: { tercero_id: terceroId, monto_centavos: monto } },
			"contaduria",
		);
	}

	/** Contaduría cancela una compensación. */
	async function cancelar(id: string, encabezados = conGoogle()) {
		const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM compensaciones WHERE id = $1", [
			id,
		]);
		return mandarAccion(
			servidor,
			"contaduria.cancelar_compensacion",
			{ datos: { compensacion_id: id, motivo: "Se compensó con la nota equivocada" }, version: rows[0]?.v },
			"contaduria",
			encabezados,
		);
	}

	/** Un cliente que también es acreedor: dos notas que nos debe y una deuda de dos mensualidades. */
	function clienteYAcreedor() {
		return clienteQueTambienEsAcreedor(servidor);
	}

	it("baja el mismo monto de cada lado, primero lo que vence antes, hasta lo menor de los dos", async () => {
		const { cliente, notas, deuda } = await clienteYAcreedor();
		// Nos debe $800 y le debemos $1,000: hasta $800.
		expect((await compensar(cliente.terceroId, 90_000)).cuerpo).toMatchObject({
			codigo: "monto_mayor_que_maximo",
			mensaje: "Hasta $800.",
		});
		const respuesta = await compensar(cliente.terceroId, 60_000);
		expect(respuesta.cuerpo.resultado).toMatchObject({
			mensaje: `Compensación registrada: $600 con ${cliente.nombre}`,
		});
		expect(await cuentaComoQuedo(servidor, notas[0] ?? "")).toMatchObject({ saldo: 0, estado: "pagada" });
		expect(await cuentaComoQuedo(servidor, notas[1] ?? "")).toMatchObject({ saldo: 20_000, estado: "pagada_en_parte" });
		expect(await cuentaPorPagarComoQuedo(servidor, deuda.cuentas[0] ?? "")).toMatchObject({
			saldo: 0,
			estado: "pagada",
		});
		expect(await cuentaPorPagarComoQuedo(servidor, deuda.cuentas[1] ?? "")).toMatchObject({
			saldo: 40_000,
			estado: "pagada_en_parte",
		});
		// Lo que queda: nos debe $200 y le debemos $400.
		const resto = await compensar(cliente.terceroId, 20_000);
		expect(resto.estado).toBe(200);
		expect(await cuentaPorPagarComoQuedo(servidor, deuda.cuentas[1] ?? "")).toMatchObject({ saldo: 20_000 });
		expect((await compensar(cliente.terceroId, 10_000)).cuerpo).toMatchObject({
			codigo: "sin_saldo_para_compensar",
		});
		expect((await compensar(cliente.terceroId, 10_050)).estado).toBe(400);
	});

	it("cancelar pide «Confirmar con Google», regresa los saldos de los dos lados y reabre la deuda saldada", async () => {
		const { cliente, notas, deuda } = await clienteYAcreedor();
		await mandarAccion(
			servidor,
			"contaduria.compensar",
			{ datos: { tercero_id: cliente.terceroId, monto_centavos: 50_000 } },
			"contaduria",
		);
		// Con la otra mensualidad pagada, la compensación saldó la deuda.
		const { rows: cuentas } = await servidor.base.dueno.query(
			"SELECT version::int AS v FROM cuentas_por_pagar WHERE id = $1",
			[deuda.cuentas[1]],
		);
		const pago = await mandarAccion(
			servidor,
			"contaduria.pagar_cuenta_por_pagar",
			{
				datos: { cuenta_por_pagar_id: deuda.cuentas[1], monto_centavos: 50_000, medio: "efectivo", referencia: "R-9" },
				version: cuentas[0]?.v,
			},
			"contaduria",
			conGoogle(),
		);
		expect(pago.estado).toBe(200);
		const { rows: estado } = await servidor.base.dueno.query("SELECT estado FROM deudas WHERE id = $1", [deuda.id]);
		expect(estado).toEqual([{ estado: "saldada" }]);
		const { rows } = await servidor.base.dueno.query("SELECT id FROM compensaciones WHERE tercero_id = $1", [
			cliente.terceroId,
		]);
		const compensacion = String(rows[0]?.id);
		expect((await cancelar(compensacion, {})).estado).toBe(401);
		expect((await cancelar(compensacion)).cuerpo.resultado).toMatchObject({
			mensaje: `Compensación con ${cliente.nombre} cancelada`,
		});
		expect(await cuentaComoQuedo(servidor, notas[0] ?? "")).toMatchObject({ saldo: 30_000, estado: "sin_pagar" });
		expect(await cuentaPorPagarComoQuedo(servidor, deuda.cuentas[0] ?? "")).toMatchObject({
			saldo: 50_000,
			estado: "por_pagar",
		});
		const { rows: despues } = await servidor.base.dueno.query("SELECT estado FROM deudas WHERE id = $1", [deuda.id]);
		expect(despues).toEqual([{ estado: "abierta" }]);
		expect((await cancelar(compensacion)).cuerpo).toMatchObject({ codigo: "compensacion_cancelada" });
	});
});
