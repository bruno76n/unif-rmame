/**
 * Prueba de la carga de los conteos y los ajustes de la muestra: la existencia de arranque de Bodega, el conteo de
 * Playeras que cuadra, el de Pants y sudaderas con su AJ- esperando y el de la camisa con su AJ- rechazado; los seis
 * mínimos de la siembra; y que una segunda carga no hace nada.
 * Fase 14 · docs/fases/14-inventario-recepcion-del-taller-conteos-ajustes-y-reabasto.md («Cómo se construye»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../src/nucleo/base/conexion.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../src/nucleo/pruebas/servidor-de-prueba.ts";
import { cargarConteosYAjustesDeLaMuestra } from "./conteos-y-ajustes.ts";

describe("los conteos y los ajustes de la muestra", () => {
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

	it("carga la existencia de Bodega, los tres conteos con sus ajustes y los mínimos; otra vez, no hace nada", async () => {
		expect(
			await consultar(
				`SELECT c.tipo, c.contado_en::date::text AS dia, count(l.id)::int > 0 AS con_renglones,
					sum(abs(l.diferencia))::int AS diferencias
				 FROM conteos c JOIN conteo_lineas l ON l.conteo_id = c.id GROUP BY c.id ORDER BY c.contado_en`,
			),
		).toEqual([
			{ tipo: "inicial", dia: "2026-09-01", con_renglones: true, diferencias: expect.any(Number) },
			{ tipo: "nuevo", dia: "2026-09-30", con_renglones: true, diferencias: 2 },
			{ tipo: "nuevo", dia: "2026-10-03", con_renglones: true, diferencias: 0 },
			{ tipo: "nuevo", dia: "2026-10-09", con_renglones: true, diferencias: 3 },
		]);
		expect(
			await consultar(
				`SELECT a.estado, a.motivo_rechazo, p.nombre, t.nombre AS talla, l.piezas_sistema, l.piezas_contadas
				 FROM ajustes a JOIN ajuste_lineas l ON l.ajuste_id = a.id JOIN variantes v ON v.id = l.variante_id
				 JOIN productos p ON p.id = v.producto_id JOIN tallas t ON t.id = v.talla_id ORDER BY a.folio, l.renglon`,
			),
		).toEqual([
			{
				estado: "rechazado",
				motivo_rechazo: "Las manchadas van a reproceso, no a ajuste",
				nombre: "Camisa manga larga blanca",
				talla: "12",
				piezas_sistema: 9,
				piezas_contadas: 7,
			},
			{
				estado: "esperando_autorizacion",
				motivo_rechazo: null,
				nombre: "Pants marino liso",
				talla: "14",
				piezas_sistema: 38,
				piezas_contadas: 36,
			},
			{
				estado: "esperando_autorizacion",
				motivo_rechazo: null,
				nombre: "Pants marino liso",
				talla: "16",
				piezas_sistema: 22,
				piezas_contadas: 23,
			},
		]);
		// La existencia no cambió: los ajustes no se autorizaron.
		expect(
			await consultar(
				`SELECT e.piezas FROM existencias e JOIN ubicaciones u ON u.id = e.ubicacion_id AND u.codigo = 'BOD'
				 JOIN variantes v ON v.id = e.variante_id JOIN productos p ON p.id = v.producto_id AND p.escuela_id IS NULL
				 JOIN tallas t ON t.id = v.talla_id WHERE p.nombre = 'Pants marino liso' AND t.nombre IN ('14', '16') ORDER BY t.nombre`,
			),
		).toEqual([{ piezas: 38 }, { piezas: 22 }]);
		expect(await consultar("SELECT count(*)::int AS n FROM minimos WHERE baja_en IS NULL")).toEqual([{ n: 6 }]);
		await cargarConteosYAjustesDeLaMuestra(crearBase(servidor.base.dueno));
		expect(await consultar("SELECT count(*)::int AS n FROM conteos")).toEqual([{ n: 4 }]);
	});
});
