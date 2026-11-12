/**
 * Prueba de «Pagar lo recibido»: con una factura detenida que cobra de más, se pide a Dirección lo recibido más su IVA
 * proporcional; si espera a Aduana, no tiene caso.
 * Fase 17 · docs/fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md (criterio «"Pagar lo recibido" pide a
 * Dirección lo recibido más su IVA proporcional»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { facturaComoQuedo, facturaDePrueba, versionPorPagar } from "../../../nucleo/pruebas/por-pagar-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("«Pagar lo recibido» pide a Dirección lo recibido más su IVA proporcional", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Contaduría pide pagar lo recibido de una factura. */
	async function pedir(facturaId: string) {
		return mandarAccion(
			servidor,
			"contaduria.pedir_pago_lo_recibido",
			{
				datos: { factura_proveedor_id: facturaId },
				version: await versionPorPagar(servidor, "facturas_proveedor", facturaId),
			},
			"contaduria",
		);
	}

	it("«Pagar lo recibido» pide a Dirección lo recibido más su IVA proporcional; la cuenta sigue detenida", async () => {
		// Llegaron 80 de 100 m: lo recibido vale $6,430 y su IVA proporcional, $1,028.80.
		const factura = await facturaDePrueba(servidor, { metros: 80 });
		const pedida = await pedir(factura.id);
		expect(pedida.cuerpo.resultado).toMatchObject({
			mensaje: "Solicitud enviada a Dirección: pago por lo recibido",
			folio: expect.stringMatching(/^AU-/),
		});
		const { rows } = await servidor.base.dueno.query(
			`SELECT a.tipo, a.resumen, a.detalle, a.importe_centavos::int AS importe,
				a.importe_facturado_centavos::int AS facturado, d.clave AS departamento
			 FROM autorizaciones a JOIN departamentos d ON d.id = a.departamento_origen_id WHERE a.factura_proveedor_id = $1`,
			[factura.id],
		);
		expect(rows).toEqual([
			{
				tipo: "pago_fuera_de_lo_normal",
				resumen: expect.stringMatching(/^Pagar a .+ lo recibido: \$7,458\.80 en lugar de \$9,268\.40$/),
				detalle: "La factura dice $7,990 sin IVA y lo recibido suma $6,430",
				importe: 745_880,
				facturado: 926_840,
				departamento: "contaduria",
			},
		]);
		expect(await facturaComoQuedo(servidor, factura.id)).toMatchObject({
			estado: "esperando_autorizacion",
			cuenta: "detenida",
		});
		expect((await pedir(factura.id)).cuerpo).toMatchObject({
			codigo: "ya_pedida",
			mensaje: `${factura.folio} ya espera la decisión de Dirección.`,
		});
	});

	it("si espera a que Aduana reciba, o si no está detenida, no se pide", async () => {
		const sinNada = await facturaDePrueba(servidor, { metros: 0, piezas: 0 });
		expect((await pedir(sinNada.id)).cuerpo).toMatchObject({
			codigo: "responsable_aduana",
			mensaje: `${sinNada.folio} espera a que Aduana reciba la mercancía: no se puede pagar lo recibido.`,
		});
		const conciliada = await facturaDePrueba(servidor);
		expect((await pedir(conciliada.id)).cuerpo).toMatchObject({
			codigo: "factura_no_detenida",
			mensaje: `${conciliada.folio} no está detenida.`,
		});
	});
});
