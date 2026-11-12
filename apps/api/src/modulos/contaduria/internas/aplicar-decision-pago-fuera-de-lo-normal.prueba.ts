/**
 * Prueba del efecto de la decisión de Dirección sobre «Pagar lo recibido»: autorizado, la cuenta queda por ese monto y
 * la diferencia por aclarar con la nota de crédito del proveedor; rechazado, sigue detenida.
 * Fase 17 · docs/fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md (criterio «"Pagar lo recibido" pide a
 * Dirección lo recibido más su IVA proporcional; autorizado, la cuenta queda por ese monto; rechazado, sigue
 * detenida»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decidirDePrueba } from "../../../nucleo/pruebas/aduana-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import {
	type FacturaDePrueba,
	facturaComoQuedo,
	facturaDePrueba,
	pagarCuentaDePrueba,
	versionPorPagar,
} from "../../../nucleo/pruebas/por-pagar-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Autorizado, la cuenta queda por lo recibido con su IVA; rechazado, sigue detenida", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una factura que cobra los 100 m cuando llegaron 80, con su «Pagar lo recibido» ya pedido. */
	async function pedida(): Promise<FacturaDePrueba & { autorizacion: string }> {
		const factura = await facturaDePrueba(servidor, { metros: 80 });
		const respuesta = await mandarAccion(
			servidor,
			"contaduria.pedir_pago_lo_recibido",
			{
				datos: { factura_proveedor_id: factura.id },
				version: await versionPorPagar(servidor, "facturas_proveedor", factura.id),
			},
			"contaduria",
		);
		const { autorizacion_id } = respuesta.cuerpo.resultado as { autorizacion_id: string };
		return { ...factura, autorizacion: autorizacion_id };
	}

	/** Contaduría registra la nota de crédito del proveedor. */
	async function notaDeCredito(facturaId: string, folio: string) {
		return mandarAccion(
			servidor,
			"contaduria.registrar_nota_credito_proveedor",
			{
				datos: { factura_proveedor_id: facturaId, folio_nota: folio },
				version: await versionPorPagar(servidor, "facturas_proveedor", facturaId),
			},
			"contaduria",
		);
	}

	it("autorizado, la cuenta queda por pagar por lo recibido más su IVA y la diferencia, por aclarar", async () => {
		const factura = await pedida();
		expect((await decidirDePrueba(servidor, factura.autorizacion, { decision: "autorizar" })).estado).toBe(200);
		expect(await facturaComoQuedo(servidor, factura.id)).toMatchObject({
			estado: "autorizada",
			cuenta: "por_pagar",
			importe: 745_880,
			saldo: 745_880,
		});
		const { rows } = await servidor.base.dueno.query(
			`SELECT total_facturado_centavos::int AS total, monto_autorizado_centavos::int AS autorizado,
				diferencia_por_aclarar_centavos::int AS diferencia FROM facturas_proveedor WHERE id = $1`,
			[factura.id],
		);
		expect(rows).toEqual([{ total: 926_840, autorizado: 745_880, diferencia: 180_960 }]);
		const [renglon] = (
			await servidor.base.dueno.query("SELECT antes, despues FROM bitacora WHERE entidad_id = $1", [
				factura.autorizacion,
			])
		).rows;
		expect(renglon).toMatchObject({
			antes: { estado: "por_autorizar", documento: { estado: "esperando_autorizacion" } },
			despues: { estado: "autorizada", documento: { estado: "autorizada", importe_centavos: 745_880 } },
		});
		expect((await pagarCuentaDePrueba(servidor, factura.cuentaId, 745_880)).estado).toBe(200);
		// La nota de crédito del proveedor aclara la diferencia, una sola vez.
		expect((await notaDeCredito(factura.id, "NC-552")).cuerpo.resultado).toMatchObject({
			mensaje: `Diferencia de ${factura.folio} aclarada con NC-552`,
		});
		expect((await notaDeCredito(factura.id, "NC-553")).cuerpo).toMatchObject({
			codigo: "diferencia_ya_aclarada",
			mensaje: `La diferencia de ${factura.folio} ya se aclaró con NC-552.`,
		});
	});

	it("rechazado, la factura vuelve a detenida a cargo de Contaduría y su cuenta sigue detenida; sin autorizar no hay diferencia que aclarar", async () => {
		const factura = await pedida();
		expect(
			(await decidirDePrueba(servidor, factura.autorizacion, { decision: "rechazar", motivo: "Que mande la nota" }))
				.estado,
		).toBe(200);
		expect(await facturaComoQuedo(servidor, factura.id)).toMatchObject({
			estado: "detenida",
			responsable: "contaduria",
			cuenta: "detenida",
			importe: 926_840,
		});
		expect((await notaDeCredito(factura.id, "NC-554")).cuerpo).toMatchObject({ codigo: "factura_no_autorizada" });
	});
});
