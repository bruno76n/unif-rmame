/**
 * Prueba de Producción de la muestra: lo cargan las acciones del sistema, en el día que dice la muestra.
 * Fase 12 · docs/fases/12-produccion.md («Cómo se construye»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearServidorDePrueba, type ServidorDePrueba } from "../src/nucleo/pruebas/servidor-de-prueba.ts";
import { buenasPorOperacion, repartoDeTallas } from "./produccion.ts";

describe("los datos de la muestra de Producción (flujos, órdenes, lotes, cortes, bultos y registros) se cargan con estas mismas acciones", () => {
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

	it("el reparto de las tallas suma las piezas del lote, con más en el centro; lo bueno nunca pasa de la operación anterior", () => {
		const piezas = repartoDeTallas(7, 300);
		expect(piezas.reduce((a, b) => a + b, 0)).toBe(300);
		expect(Math.max(...piezas)).toBe(piezas[3]);
		expect(buenasPorOperacion([120, 120, 120, 118, 118], [0, 0, 1, 1, 0])).toEqual([120, 120, 119, 118, 118]);
	});

	it("los siete flujos con sus operaciones y sus tarifas, y cada prenda que se fabrica con su flujo", async () => {
		expect(
			await consultar(
				`SELECT f.nombre, string_agg(o.nombre, ' · ' ORDER BY fo.orden) AS operaciones,
					bool_and(t.tarifa_centavos IS NOT NULL) AS con_tarifas
				 FROM flujos f JOIN flujo_operaciones fo ON fo.flujo_id = f.id AND fo.baja_en IS NULL
				 JOIN operaciones o ON o.id = fo.operacion_id
				 LEFT JOIN tarifas_operacion t ON t.flujo_operacion_id = fo.id AND t.vigente_hasta IS NULL
				 WHERE f.nombre = 'Playera polo' GROUP BY f.nombre`,
			),
		).toEqual([
			{
				nombre: "Playera polo",
				operaciones: "Corte · Hombros · Cuello · Mangas · Costados · Ojal y botón · Planchado · Empaque",
				con_tarifas: true,
			},
		]);
		expect(await consultar("SELECT count(*)::int AS n FROM flujos")).toEqual([{ n: 7 }]);
		expect(await consultar("SELECT count(*)::int AS n FROM productos WHERE flujo_id IS NOT NULL")).toEqual([{ n: 26 }]);
	});

	it("las órdenes de temporada y reabasto con sus lotes; el de pants terminado y el de polos en proceso, con lo que dicen sus registros", async () => {
		expect(
			await consultar(
				// Los de temporada y reabasto; los de los pedidos los manda Ventas (fase 16).
				"SELECT estado, count(*)::int AS n FROM lotes WHERE destino <> 'pedido' GROUP BY estado ORDER BY estado",
			),
		).toEqual([
			{ estado: "en_proceso", n: 1 },
			{ estado: "por_cortar", n: 10 },
			{ estado: "terminado", n: 1 },
		]);
		expect(
			await consultar(
				`SELECT l.estado, sum(t.piezas_cortadas)::int AS cortadas, sum(t.piezas_terminadas)::int AS terminadas,
					sum(t.piezas_merma)::int AS merma, (l.terminado_en AT TIME ZONE 'America/Mexico_City')::date::text AS termino
				 FROM lotes l JOIN lote_tallas t ON t.lote_id = l.id WHERE l.estado <> 'por_cortar' GROUP BY l.id ORDER BY l.estado`,
			),
		).toEqual([
			{ estado: "en_proceso", cortadas: 300, terminadas: 40, merma: 6, termino: null },
			{ estado: "terminado", cortadas: 120, terminadas: 118, merma: 2, termino: "2026-10-11" },
		]);
		// Cada registro de la tablet se aplicó con la tarifa que valía, y el Taller cuadra con lo que lleva Producción.
		expect(
			await consultar(
				"SELECT resultado, count(*)::int AS n FROM comandos_recibidos WHERE tipo_comando = 'produccion.registrar_operacion' GROUP BY resultado",
			),
		).toEqual([{ resultado: "aplicado", n: expect.any(Number) }]);
		expect(await consultar("SELECT count(*)::int AS n FROM registros_operacion WHERE tarifa_centavos IS NULL")).toEqual(
			[{ n: 0 }],
		);
		expect(
			await consultar(
				`SELECT lt.lote_id FROM lote_tallas lt JOIN lotes l ON l.id = lt.lote_id AND l.estado <> 'por_cortar'
				 WHERE coalesce(lt.piezas_cortadas, 0) - lt.piezas_merma <> coalesce((
					SELECT sum(CASE WHEN m.destino_ubicacion_id = u.id THEN m.piezas ELSE -m.piezas END)
					FROM movimiento_lineas m JOIN ubicaciones u ON u.tipo = 'taller'
					WHERE m.lote_id = lt.lote_id AND m.variante_id = lt.variante_id
						AND (m.destino_ubicacion_id = u.id OR m.origen_ubicacion_id = u.id)), 0)`,
			),
		).toEqual([]);
	});
});
