/**
 * Prueba de `contaduria.revisar_facturas_de_orden`: recibir una orden o rechazar lo recibido de más vuelve a revisar
 * sus facturas sin pagos; una pagada o autorizada no cambia y avisa a Contaduría; la orden pagada se cierra cuando
 * llega lo que faltaba; un pago cancelado deja la factura otra vez a revisión.
 * Fase 17 · docs/fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md (criterio «Recibir una orden o rechazar
 * lo recibido de más vuelve a revisar sus facturas sin pagos»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decidirDePrueba, ordenParaRecibir, recibirDePrueba } from "../../../nucleo/pruebas/aduana-de-prueba.ts";
import { trabasDeLaBase } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { conGoogle, mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import {
	capturarDePrueba,
	facturaComoQuedo,
	facturaDePrueba,
	ivaDe,
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

	it("una recepción parcial que cambia quién tiene la factura detenida deja su evento, su renglón y el aviso a Aduana (decisión 716)", async () => {
		const factura = await facturaDePrueba(servidor, { metros: 0, piezas: 0 });
		expect(await facturaComoQuedo(servidor, factura.id)).toMatchObject({ estado: "detenida", responsable: "aduana" });
		const recibida = await recibirOrden(servidor, factura.orden, 80, 500);
		expect(recibida.mensaje).toMatch(new RegExp(`\\. ${factura.folio} no cuadra con lo recibido$`));
		expect(await facturaComoQuedo(servidor, factura.id)).toMatchObject({
			estado: "detenida",
			responsable: "contaduria",
		});
		const eventos = await consultar("SELECT tipo FROM eventos WHERE entidad_id = $1 ORDER BY id", [factura.id]);
		expect(eventos.map((evento) => evento.tipo)).toEqual([
			"factura_proveedor.capturada",
			"factura_proveedor.detenida",
			"factura_proveedor.detenida",
		]);
		const renglones = await consultar("SELECT descripcion FROM bitacora WHERE entidad_id = $1 ORDER BY ocurrido_en", [
			factura.id,
		]);
		expect(renglones.at(-1)?.descripcion).toMatch(new RegExp(`^${factura.folio} quedó detenida: `));
	});

	it("la orden que se paga recibida en parte se cierra cuando llega lo que faltaba (decisión 716)", async () => {
		const orden = await ordenParaRecibir(servidor);
		await recibirOrden(servidor, orden, 80, 500);
		const factura = await facturaDePrueba(servidor, { orden, subtotal: 643_000 });
		expect(factura.estado).toBe("conciliada");
		expect((await pagarCuentaDePrueba(servidor, factura.cuentaId, 643_000 + ivaDe(643_000))).estado).toBe(200);
		const estadoDeLaOrden = () => consultar("SELECT estado FROM ordenes_compra WHERE id = $1", [orden.id]);
		expect(await estadoDeLaOrden()).toEqual([{ estado: "recibida_en_parte" }]);
		await recibirOrden(servidor, orden, 20, 0);
		expect(await estadoDeLaOrden()).toEqual([{ estado: "cerrada" }]);
	});

	it("al cancelar el único pago de una factura que dejó de cuadrar, vuelve a revisarse y queda detenida (decisión 716)", async () => {
		const orden = await ordenParaRecibir(servidor);
		await recibirOrden(servidor, orden, 110, 500);
		const captura = await capturarDePrueba(servidor, {
			ordenes: [{ orden_compra_id: orden.id }],
			subtotal_centavos: 877_000,
		});
		const { factura_proveedor_id: id } = captura.cuerpo.resultado as { factura_proveedor_id: string };
		const [cuenta] = await consultar("SELECT id FROM cuentas_por_pagar WHERE factura_proveedor_id = $1", [id]);
		const pago = await pagarCuentaDePrueba(servidor, String(cuenta?.id), 100_000);
		const { pago_id: pagoId } = pago.cuerpo.resultado as { pago_id: string };
		await decidirDePrueba(servidor, await laDeMas(orden.lineaTela), {
			decision: "rechazar",
			motivo: "No pedimos tanta",
		});
		expect(await facturaComoQuedo(servidor, id)).toMatchObject({ estado: "conciliada", cuenta: "pagada_en_parte" });
		const [{ v } = { v: 0 }] = await consultar("SELECT version::int AS v FROM pagos WHERE id = $1", [pagoId]);
		const cancelado = await mandarAccion(
			servidor,
			"contaduria.cancelar_pago",
			{ datos: { pago_id: pagoId, motivo: "Se pagó de más" }, version: v },
			"contaduria",
			conGoogle(),
		);
		expect(cancelado.estado, JSON.stringify(cancelado.cuerpo)).toBe(200);
		expect(await facturaComoQuedo(servidor, id)).toMatchObject({
			estado: "detenida",
			responsable: "contaduria",
			cuenta: "detenida",
			saldo: 877_000 + ivaDe(877_000),
		});
	});

	it("rechazar lo de más mientras Aduana recibe la misma orden, ligada a otra por una factura: las dos entran sin trabarse (decisión 716)", async () => {
		const una = await ordenParaRecibir(servidor);
		const otra = await ordenParaRecibir(servidor, 100, una.proveedor);
		await recibirOrden(servidor, una, 110, 400);
		const ligadas = await capturarDePrueba(servidor, {
			ordenes: [
				{ orden_compra_id: una.id, importe_sin_iva_centavos: 799_000 },
				{ orden_compra_id: otra.id, importe_sin_iva_centavos: 799_000 },
			],
			subtotal_centavos: 1_598_000,
		});
		expect(ligadas.estado).toBe(200);
		const au = await laDeMas(una.lineaTela);
		const trabasAntes = await trabasDeLaBase(servidor);
		// La otra orden, tomada por otra conexión: el rechazo se detiene a la mitad.
		const conexion = await servidor.base.dueno.connect();
		await conexion.query("BEGIN");
		await conexion.query("SELECT id FROM ordenes_compra WHERE id = $1 FOR UPDATE", [otra.id]);
		const rechazo = decidirDePrueba(servidor, au, { decision: "rechazar", motivo: "No pedimos tanta" });
		let recepcion: ReturnType<typeof recibirDePrueba> | undefined;
		try {
			await esperarQueEsperen(1);
			recepcion = recibirDePrueba(servidor, una, [], 100);
			await esperarQueEsperen(2);
		} finally {
			await conexion.query("ROLLBACK");
			conexion.release();
		}
		expect((await rechazo).estado).toBe(200);
		expect((await recepcion)?.estado).toBe(200);
		expect(await trabasDeLaBase(servidor)).toBe(trabasAntes);
	});

	/**
	 * Espera, hasta diez segundos, a que haya `cuantas` transacciones esperando un candado.
	 * @returns Si llegaron.
	 */
	async function esperarQueEsperen(cuantas: number): Promise<boolean> {
		for (let vuelta = 0; vuelta < 200; vuelta++) {
			const [fila] = await consultar(
				"SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()",
				[],
			);
			if (Number(fila?.n) >= cuantas) return true;
			await new Promise((listo) => setTimeout(listo, 50));
		}
		return false;
	}
});
