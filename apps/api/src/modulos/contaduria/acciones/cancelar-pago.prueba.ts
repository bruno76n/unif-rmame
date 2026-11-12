/**
 * Prueba de `contaduria.cancelar_pago`: pide «Confirmar con Google», regresa saldos y estados y no se cancela dos veces.
 * Fase 15 · docs/fases/15-contaduria-terceros-credito-y-cobranza.md («Criterios de terminado»)
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
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Cancelar un pago pide «Confirmar con Google» y regresa saldos y estados", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** El pago y su versión, de una respuesta de «Registrar pago». */
	async function pagoDe(respuesta: { cuerpo: { resultado?: unknown } }) {
		const { pago_id, folio } = z.object({ pago_id: z.uuid(), folio: z.string() }).parse(respuesta.cuerpo.resultado);
		const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM pagos WHERE id = $1", [pago_id]);
		return { pagoId: pago_id, folio, version: z.number().parse(rows[0]?.v) };
	}

	/** Contaduría cancela un pago, con «Confirmar con Google» si no se dice otra cosa. */
	function cancelar(
		pago: { pagoId: string; version: number },
		encabezados = conGoogle(),
		motivo = "Se registró dos veces",
	) {
		return mandarAccion(
			servidor,
			"contaduria.cancelar_pago",
			{ datos: { pago_id: pago.pagoId, motivo }, version: pago.version },
			"contaduria",
			encabezados,
		);
	}

	it("sin «Confirmar con Google» no entra; con él, la nota regresa a $13,400 sin pagar y la aplicación queda cancelada", async () => {
		const zamora = await clienteDePrueba(servidor);
		const nota = await notaEntregadaDePrueba(servidor, zamora, { totalCentavos: 1_340_000 });
		const pago = await pagoDe(await pagarDePrueba(servidor, zamora, nota, 1_340_000));
		expect(await cuentaComoQuedo(servidor, nota.cuentaId)).toMatchObject({ estado: "pagada" });
		const sinGoogle = await cancelar(pago, {});
		expect(sinGoogle.estado).toBe(401);
		const cancelado = await cancelar(pago);
		expect(cancelado.cuerpo.resultado).toMatchObject({ mensaje: `${pago.folio} cancelado` });
		expect(await cuentaComoQuedo(servidor, nota.cuentaId)).toEqual({
			saldo: 1_340_000,
			estado: "sin_pagar",
			con_pagada_en: false,
		});
		const { rows } = await servidor.base.dueno.query(
			`SELECT p.estado, p.motivo_cancelacion, a.estado AS aplicacion, a.motivo_cancelacion AS motivo_aplicacion,
				b.descripcion, b.confirmado_con_google_en IS NOT NULL AS con_google
			 FROM pagos p JOIN aplicaciones_pago a ON a.pago_id = p.id
			 JOIN bitacora b ON b.entidad_id = p.id AND b.accion = 'contaduria.cancelar_pago' WHERE p.id = $1`,
			[pago.pagoId],
		);
		expect(rows).toEqual([
			{
				estado: "cancelado",
				motivo_cancelacion: "Se registró dos veces",
				aplicacion: "cancelada",
				motivo_aplicacion: "Se registró dos veces",
				descripcion: `Canceló el pago ${pago.folio}: Se registró dos veces`,
				con_google: true,
			},
		]);
	});

	it("de dos pagos, cancelar uno deja la nota pagada en parte; otra vez da `pago_cancelado`; sin motivo, no", async () => {
		const cliente = await clienteDePrueba(servidor);
		const nota = await notaEntregadaDePrueba(servidor, cliente, { totalCentavos: 1_000_000 });
		await pagarDePrueba(servidor, cliente, nota, 600_000);
		const segundo = await pagoDe(await pagarDePrueba(servidor, cliente, nota, 400_000));
		expect((await cancelar(segundo, conGoogle(), "no")).cuerpo).toMatchObject({
			campos: { motivo: expect.any(String) },
		});
		await cancelar(segundo);
		expect(await cuentaComoQuedo(servidor, nota.cuentaId)).toEqual({
			saldo: 400_000,
			estado: "pagada_en_parte",
			con_pagada_en: false,
		});
		const otraVez = await pagoDe({ cuerpo: { resultado: { pago_id: segundo.pagoId, folio: segundo.folio } } });
		expect((await cancelar(otraVez)).cuerpo).toMatchObject({
			codigo: "pago_cancelado",
			mensaje: `${segundo.folio} ya está cancelado.`,
		});
		expect((await cancelar(otraVez, conGoogle())).estado).toBe(422);
	});
});
