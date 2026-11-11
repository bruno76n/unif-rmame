/**
 * Prueba de Aduana y Bodega de la muestra: lo cargan las acciones del sistema, en el día que dice la muestra.
 * Fase 11 · docs/fases/11-aduana-y-bodega.md («Cómo se construye»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearServidorDePrueba, type ServidorDePrueba } from "../src/nucleo/pruebas/servidor-de-prueba.ts";

describe("los datos de la muestra de Aduana y Bodega se cargan con estas mismas acciones", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string): Promise<Record<string, unknown>[]> {
		return (await servidor.base.dueno.query(texto)).rows;
	}

	it("las órdenes recibidas en su día, sus rollos en Bodega, y la recibida en parte con sus 300 m en aduana", async () => {
		expect(
			await consultar(
				`SELECT t.nombre AS proveedor, o.estado, (r.recibido_en AT TIME ZONE 'America/Mexico_City')::date::text AS recibida
				 FROM recepciones r JOIN ordenes_compra o ON o.id = r.orden_compra_id JOIN proveedores p ON p.id = o.proveedor_id
				 JOIN terceros t ON t.id = p.tercero_id WHERE r.tipo = 'aduana_de_proveedor' ORDER BY r.recibido_en`,
			),
		).toEqual([
			{ proveedor: "Cierres Aguilar", estado: "recibida", recibida: "2026-09-07" },
			{ proveedor: "Textiles Aurora", estado: "recibida", recibida: "2026-09-28" },
			{ proveedor: "Hilos del Centro", estado: "recibida", recibida: "2026-09-29" },
			{ proveedor: "Textiles San Marcos", estado: "recibida", recibida: "2026-10-02" },
			{ proveedor: "Textiles San Marcos", estado: "recibida", recibida: "2026-10-04" },
			{ proveedor: "Telas Jalisco", estado: "recibida_en_parte", recibida: "2026-10-05" },
		]);
		// La gabardina: sus cuatro rollos de la muestra y uno más hasta los 500 m, en Bodega.
		expect(
			await consultar(
				`SELECT u.codigo, count(*)::int AS rollos, sum(e.cantidad)::text AS metros FROM existencias_material e
				 JOIN ubicaciones u ON u.id = e.ubicacion_id JOIN materiales m ON m.id = e.material_id
				 WHERE m.nombre = 'Gabardina azul marino' AND e.cantidad <> 0 GROUP BY u.codigo`,
			),
		).toEqual([{ codigo: "BOD", rollos: 5, metros: "500.000" }]);
		// Los cuadros vino de la orden en parte se quedan en aduana.
		expect(
			await consultar(
				`SELECT u.codigo, sum(e.cantidad)::text AS metros FROM existencias_material e JOIN ubicaciones u ON u.id = e.ubicacion_id
				 JOIN materiales m ON m.id = e.material_id WHERE m.nombre = 'Cuadros vino, Colegio Morelos' AND e.cantidad <> 0 GROUP BY u.codigo`,
			),
		).toEqual([{ codigo: "ADU", metros: "300.000" }]);
		expect(await consultar("SELECT estado, count(*)::int AS n FROM despachos GROUP BY estado")).toEqual([
			{ estado: "recibido", n: 5 },
		]);
	});
});
