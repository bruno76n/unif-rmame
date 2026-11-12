/**
 * Prueba de `contaduria.revisar_facturas_de_orden`: recibir una orden o rechazar lo recibido de más vuelve a revisar
 * sus facturas sin pagos; una pagada o autorizada no cambia y avisa a Contaduría.
 * Fase 17 · docs/fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md (criterio «Recibir una orden o rechazar
 * lo recibido de más vuelve a revisar sus facturas sin pagos»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decidirDePrueba, ordenParaRecibir } from "../../../nucleo/pruebas/aduana-de-prueba.ts";
import {
	capturarDePrueba,
	facturaComoQuedo,
	facturaDePrueba,
	pagarCuentaDePrueba,
	recibirOrden,
} from "../../../nucleo/pruebas/por-pagar-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Recibir una orden o rechazar lo recibido de más vuelve a revisar sus facturas sin pagos; una pagada o autorizada no cambia y avisa", () => {
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

	/** La autorización de lo de más de una línea. */
	async function laDeMas(lineaId: string): Promise<string> {
		const [au] = await consultar(
			"SELECT id FROM autorizaciones WHERE tipo = 'recepcion_de_mas' AND orden_compra_linea_id = $1",
			[lineaId],
		);
		return String(au?.id);
	}

	it("recibir la orden libera la factura detenida a cargo de Aduana; Aduana ve el folio sin montos y la bitácora va con la recepción", async () => {
		const factura = await facturaDePrueba(servidor, { metros: 0, piezas: 0 });
		expect(factura.estado).toBe("detenida");
		const recibida = await recibirOrden(servidor, factura.orden);
		expect(recibida.mensaje).toBe(
			`${factura.orden.folio} recibida: queda en aduana hasta que bodega la confirme. ${factura.folio} ya se puede pagar`,
		);
		expect(await facturaComoQuedo(servidor, factura.id)).toMatchObject({
			estado: "conciliada",
			responsable: null,
			cuenta: "por_pagar",
			valor_recibido: 799_000,
		});
		const renglones = await consultar(
			`SELECT b.descripcion, b.comando_id FROM bitacora b
			 WHERE b.comando_id = (SELECT comando_id FROM bitacora WHERE entidad_id = $1 AND descripcion LIKE '%quedó%')
			 ORDER BY b.ocurrido_en, b.id`,
			[factura.id],
		);
		expect(renglones.map((renglon) => renglon.descripcion)).toEqual([
			expect.stringMatching(/^Recibió OC-/),
			`${factura.folio} quedó conciliada al recibir ${factura.orden.folio}`,
		]);
		const eventos = await consultar("SELECT tipo FROM eventos WHERE entidad_id = $1 ORDER BY id", [factura.id]);
		expect(eventos.map((evento) => evento.tipo)).toContain("factura_proveedor.liberada");
	});

	it("una recepción parcial deja detenida a cargo de Contaduría la que cobra todo; lo que falta la concilia", async () => {
		const orden = await ordenParaRecibir(servidor);
		const factura = await facturaDePrueba(servidor, { orden });
		await recibirOrden(servidor, orden, 80, 500);
		expect(await facturaComoQuedo(servidor, factura.id)).toMatchObject({
			estado: "detenida",
			responsable: "contaduria",
			cuenta: "detenida",
			valor_recibido: 643_000,
		});
		const resto = await recibirOrden(servidor, orden, 20, 0);
		expect(resto.mensaje).toMatch(new RegExp(`\\. ${factura.folio} ya se puede pagar$`));
		expect(await facturaComoQuedo(servidor, factura.id)).toMatchObject({ estado: "conciliada", cuenta: "por_pagar" });
	});

	it("rechazar lo recibido de más detiene la factura conciliada sin pagos; el renglón de Dirección lo dice", async () => {
		const orden = await ordenParaRecibir(servidor);
		const recibida = await recibirOrden(servidor, orden, 110, 500);
		expect(recibida.mensaje).toMatch(/espera autorización de Dirección$/);
		// La factura cobra los 110 m que llegaron: cuadra mientras Dirección no decide.
		const captura = await capturarDePrueba(servidor, {
			ordenes: [{ orden_compra_id: orden.id }],
			subtotal_centavos: 877_000,
		});
		const { factura_proveedor_id: id, folio } = captura.cuerpo.resultado as {
			factura_proveedor_id: string;
			folio: string;
		};
		expect(await facturaComoQuedo(servidor, id)).toMatchObject({ estado: "conciliada" });
		const au = await laDeMas(orden.lineaTela);
		expect((await decidirDePrueba(servidor, au, { decision: "rechazar", motivo: "No pedimos tanta" })).estado).toBe(
			200,
		);
		expect(await facturaComoQuedo(servidor, id)).toMatchObject({
			estado: "detenida",
			responsable: "contaduria",
			motivo: "La factura dice $8,770 sin IVA y lo recibido suma $7,990",
			cuenta: "detenida",
		});
		const [renglon] = await consultar("SELECT despues FROM bitacora WHERE entidad_id = $1", [au]);
		expect(renglon?.despues).toMatchObject({
			documento: { facturas: [`${folio} quedó detenida: La factura dice $8,770 sin IVA y lo recibido suma $7,990`] },
		});
	});

	it("una factura con pagos no cambia: si lo recibido baja y ya no cuadra, avisa a Contaduría", async () => {
		const orden = await ordenParaRecibir(servidor);
		await recibirOrden(servidor, orden, 110, 500);
		const captura = await capturarDePrueba(servidor, {
			ordenes: [{ orden_compra_id: orden.id }],
			subtotal_centavos: 877_000,
		});
		const { factura_proveedor_id: id } = captura.cuerpo.resultado as { factura_proveedor_id: string };
		const [cuenta] = await consultar("SELECT id FROM cuentas_por_pagar WHERE factura_proveedor_id = $1", [id]);
		expect((await pagarCuentaDePrueba(servidor, String(cuenta?.id), 100_000)).estado).toBe(200);
		await decidirDePrueba(servidor, await laDeMas(orden.lineaTela), {
			decision: "rechazar",
			motivo: "No pedimos tanta",
		});
		expect(await facturaComoQuedo(servidor, id)).toMatchObject({
			estado: "conciliada",
			cuenta: "pagada_en_parte",
			valor_recibido: 877_000,
		});
		const eventos = await consultar("SELECT tipo FROM eventos WHERE entidad_id = $1", [id]);
		expect(eventos.map((evento) => evento.tipo)).toContain("factura_proveedor.dejo_de_cuadrar");
	});
});
