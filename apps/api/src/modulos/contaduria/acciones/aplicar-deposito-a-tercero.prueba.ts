/**
 * Prueba de los depósitos a la cuenta de un tercero: el pago de un cliente que fue a la cuenta de alguien a quien le
 * debemos baja la nota del cliente y, ahora o después, la deuda con ese tercero, sin pasar del monto; lo que sobra queda
 * a favor con el tercero. Cancelar el pago regresa las dos.
 * Fase 17 · docs/modulos/contaduria/pagos-y-saldo-a-favor.md (regla 4, «`contaduria.aplicar_deposito_a_tercero`» y
 * «Lo que se agrega después a estas acciones»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
	clienteDePrueba,
	cuentaComoQuedo,
	notaEntregadaDePrueba,
	pagarDePrueba,
} from "../../../nucleo/pruebas/contaduria-de-prueba.ts";
import { conGoogle, mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { cuentaPorPagarComoQuedo, deudaDePrueba } from "../../../nucleo/pruebas/por-pagar-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Un depósito a la cuenta de un tercero baja la nota del cliente y la deuda con el tercero", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una nota de un cliente por $1,000 y una deuda de dos mensualidades de $300 con otro tercero. */
	async function notaYDeuda() {
		const cliente = await clienteDePrueba(servidor);
		const nota = await notaEntregadaDePrueba(servidor, cliente, { totalCentavos: 100_000 });
		const deuda = await deudaDePrueba(servidor, { totalCentavos: 60_000, mensualidades: 2 });
		return { cliente, nota, deuda };
	}

	/** Aplica después un depósito a una deuda. */
	async function aplicar(pagoId: string, cuentaId: string) {
		const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM pagos WHERE id = $1", [pagoId]);
		return mandarAccion(
			servidor,
			"contaduria.aplicar_deposito_a_tercero",
			{ datos: { pago_id: pagoId, cuenta_por_pagar_id: cuentaId }, version: rows[0]?.v },
			"contaduria",
		);
	}

	it("«Ahora»: baja la nota por todo y la deuda hasta su saldo; lo que sobra queda a favor y se aplica después", async () => {
		const { cliente, nota, deuda } = await notaYDeuda();
		const deposito = {
			medio: "cuenta_tercero",
			referencia: "SPEI 4471",
			tercero_deposito_id: deuda.terceroId,
			aplicar: "ahora",
			cuenta_por_pagar_id: deuda.cuentas[0],
		};
		const respuesta = await pagarDePrueba(servidor, cliente, nota, 50_000, deposito);
		expect(respuesta.cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(
				new RegExp(`^PG-\\d+: \\$500 de ${cliente.nombre}, aplicado a ${deuda.folio} · mensualidad 1 de 2$`),
			),
		});
		expect(respuesta.cuerpo.avisos).toEqual([expect.stringMatching(/^Quedan \$200 a favor con /)]);
		expect(await cuentaComoQuedo(servidor, nota.cuentaId)).toMatchObject({ saldo: 50_000 });
		expect(await cuentaPorPagarComoQuedo(servidor, deuda.cuentas[0] ?? "")).toMatchObject({
			estado: "pagada",
			saldo: 0,
		});
		const { pago_id: pagoId } = z.object({ pago_id: z.uuid() }).parse(respuesta.cuerpo.resultado);
		// Lo que sobra se aplica después a la otra mensualidad.
		const despues = await aplicar(pagoId, deuda.cuentas[1] ?? "");
		expect(despues.cuerpo.resultado).toMatchObject({ queda_centavos: 0 });
		expect(await cuentaPorPagarComoQuedo(servidor, deuda.cuentas[1] ?? "")).toMatchObject({ saldo: 10_000 });
		expect((await aplicar(pagoId, deuda.cuentas[1] ?? "")).cuerpo).toMatchObject({ codigo: "deposito_ya_aplicado" });
		// Cancelar el pago regresa la nota y la deuda, que vuelve a abierta.
		const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM pagos WHERE id = $1", [pagoId]);
		const cancelado = await mandarAccion(
			servidor,
			"contaduria.cancelar_pago",
			{ datos: { pago_id: pagoId, motivo: "Fue a la cuenta equivocada" }, version: rows[0]?.v },
			"contaduria",
			conGoogle(),
		);
		expect(cancelado.estado).toBe(200);
		expect(await cuentaComoQuedo(servidor, nota.cuentaId)).toMatchObject({ saldo: 100_000 });
		expect(await cuentaPorPagarComoQuedo(servidor, deuda.cuentas[0] ?? "")).toMatchObject({
			estado: "por_pagar",
			saldo: 30_000,
		});
		expect(await cuentaPorPagarComoQuedo(servidor, deuda.cuentas[1] ?? "")).toMatchObject({ saldo: 30_000 });
	});

	it("«Después»: queda sin aplicar; lo que se rechaza al registrar y al aplicar", async () => {
		const { cliente, nota, deuda } = await notaYDeuda();
		const otra = await deudaDePrueba(servidor, { totalCentavos: 10_000 });
		const base = { medio: "cuenta_tercero", referencia: "SPEI 9", tercero_deposito_id: deuda.terceroId };
		expect(
			(await pagarDePrueba(servidor, cliente, nota, 10_000, { ...base, tercero_deposito_id: undefined })).cuerpo,
		).toMatchObject({
			campos: { tercero_deposito_id: "¿A quién le depositó?" },
		});
		expect((await pagarDePrueba(servidor, cliente, nota, 10_000, { ...base, aplicar: "ahora" })).cuerpo).toMatchObject({
			campos: { cuenta_por_pagar_id: "Escoge la deuda." },
		});
		expect(
			(
				await pagarDePrueba(servidor, cliente, nota, 10_000, {
					...base,
					aplicar: "ahora",
					cuenta_por_pagar_id: otra.cuentas[0],
				})
			).cuerpo,
		).toMatchObject({ codigo: "deuda_de_otro_tercero" });
		const sinDeuda = await clienteDePrueba(servidor);
		expect(
			(await pagarDePrueba(servidor, cliente, nota, 10_000, { ...base, tercero_deposito_id: sinDeuda.terceroId }))
				.cuerpo,
		).toMatchObject({ codigo: "tercero_sin_deuda" });
		const despues = await pagarDePrueba(servidor, cliente, nota, 10_000, { ...base, aplicar: "despues" });
		expect(despues.cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(/^PG-\d+ registrado\. Queda sin aplicar a /),
		});
		const { pago_id: pagoId } = z.object({ pago_id: z.uuid() }).parse(despues.cuerpo.resultado);
		expect((await aplicar(pagoId, otra.cuentas[0] ?? "")).cuerpo).toMatchObject({ codigo: "deuda_de_otro_tercero" });
		const aplicado = await aplicar(pagoId, deuda.cuentas[0] ?? "");
		expect(aplicado.cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(new RegExp(`aplicado a ${deuda.folio} · mensualidad 1 de 2 de `)),
		});
		// Un pago en efectivo no es depósito a un tercero.
		const efectivo = await pagarDePrueba(servidor, cliente, nota, 10_000);
		const { pago_id: enEfectivo } = z.object({ pago_id: z.uuid() }).parse(efectivo.cuerpo.resultado);
		expect((await aplicar(enEfectivo, deuda.cuentas[1] ?? "")).cuerpo).toMatchObject({
			codigo: "pago_no_es_deposito_a_tercero",
		});
	});
});
