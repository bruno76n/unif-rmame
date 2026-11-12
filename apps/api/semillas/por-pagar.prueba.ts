/**
 * Prueba de la carga de lo que la fábrica debe en la muestra: las facturas con sus tres puntas, las deudas con las
 * mensualidades ya pagadas, los dos depósitos a la cuenta de un tercero sin aplicar, los dos descuentos de la nómina,
 * y que una segunda carga no hace nada.
 * Fase 17 · docs/fases/17-contaduria-por-pagar-facturas-gastos-y-nomina.md («Cómo se construye»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../src/nucleo/base/conexion.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../src/nucleo/pruebas/servidor-de-prueba.ts";
import { cargarPorPagarDeLaMuestra } from "./por-pagar.ts";

describe("Lo que la fábrica debe en la muestra", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[] = []) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	it("carga facturas, deudas, depósitos y descuentos como la muestra; otra vez, no hace nada", async () => {
		expect(
			await consultar(
				`SELECT f.folio_proveedor AS folio, f.estado, f.responsable_detencion AS responsable, c.estado AS cuenta,
					f.total_facturado_centavos::int AS total
				 FROM facturas_proveedor f JOIN cuentas_por_pagar c ON c.factura_proveedor_id = f.id ORDER BY f.fecha_factura`,
			),
		).toEqual([
			{ folio: "0377", estado: "conciliada", responsable: null, cuenta: "por_pagar", total: 490_000 },
			{ folio: "0915", estado: "conciliada", responsable: null, cuenta: "por_pagar", total: 283_200 },
			{ folio: "8841", estado: "detenida", responsable: "contaduria", cuenta: "detenida", total: 4_056_000 },
			{ folio: "1172", estado: "conciliada", responsable: null, cuenta: "por_pagar", total: 4_080_000 },
			{ folio: "2207", estado: "detenida", responsable: "aduana", cuenta: "detenida", total: 317_000 },
		]);
		expect(
			await consultar(
				`SELECT d.descripcion, t.nombre, t.es_acreedor, d.estado, count(*)::int AS mensualidades,
					count(*) FILTER (WHERE c.estado = 'pagada')::int AS pagadas,
					min(c.vence) FILTER (WHERE c.estado = 'por_pagar')::text AS sigue
				 FROM deudas d JOIN terceros t ON t.id = d.tercero_id
				 JOIN deuda_mensualidades m ON m.deuda_id = d.id JOIN cuentas_por_pagar c ON c.deuda_mensualidad_id = m.id
				 GROUP BY d.id, t.nombre, t.es_acreedor ORDER BY d.folio`,
			),
		).toEqual([
			{
				descripcion: "Préstamo personal",
				nombre: "Ing. Ramón Villaseñor",
				es_acreedor: true,
				estado: "abierta",
				mensualidades: 20,
				pagadas: 7,
				sigue: "2026-10-15",
			},
			{
				descripcion: "Crédito PyME",
				nombre: "Banorte",
				es_acreedor: true,
				estado: "abierta",
				mensualidades: 36,
				pagadas: 13,
				sigue: "2026-10-20",
			},
			{
				descripcion: "300 m de gabardina que prestaron en julio",
				nombre: "Distribuidora Escolar Zamora",
				es_acreedor: true,
				estado: "abierta",
				mensualidades: 1,
				pagadas: 0,
				sigue: "2026-10-31",
			},
		]);
		expect(
			await consultar(
				`SELECT p.referencia, t.nombre AS tercero, p.monto_centavos::int AS monto,
					(SELECT count(*)::int FROM aplicaciones_pago a WHERE a.pago_id = p.id AND a.cuenta_por_pagar_id IS NOT NULL) AS aplicado
				 FROM pagos p JOIN terceros t ON t.id = p.tercero_deposito_id WHERE p.medio = 'cuenta_tercero' ORDER BY p.fecha`,
			),
		).toEqual([
			{ referencia: "Transferencia 5520", tercero: "Ing. Ramón Villaseñor", monto: 1_200_000, aplicado: 0 },
			{ referencia: "Depósito 0049213", tercero: "Textiles Aurora", monto: 2_600_000, aplicado: 0 },
		]);
		expect(
			await consultar(
				`SELECT p.nombre, d.monto_semanal_centavos::int AS monto, d.motivo FROM descuentos_nomina d
				 JOIN personas p ON p.id = d.persona_id WHERE d.estado = 'vigente' ORDER BY p.nombre`,
			),
		).toEqual([
			{ nombre: "Lupita Ramos", monto: 30_000, motivo: "Abono a préstamo" },
			{ nombre: "Sergio Gómez", monto: 20_000, motivo: "Anticipo de sueldo" },
		]);
		const antes = await consultar("SELECT count(*)::int AS n FROM facturas_proveedor");
		await cargarPorPagarDeLaMuestra(crearBase(servidor.base.dueno));
		expect(await consultar("SELECT count(*)::int AS n FROM facturas_proveedor")).toEqual(antes);
	});
});
