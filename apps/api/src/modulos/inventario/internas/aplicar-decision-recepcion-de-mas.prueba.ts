/**
 * Prueba de `inventario.aplicar_decision_recepcion_de_mas`: rechazar lo de más hace nacer la devolución al proveedor
 * donde está (Aduana, Bodega o las dos) y baja lo recibido de la línea; autorizarlo no mueve nada.
 * Fase 11 · docs/fases/11-aduana-y-bodega.md (parte 1)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decidirDePrueba, ordenParaRecibir, recibirDePrueba } from "../../../nucleo/pruebas/aduana-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Rechazar lo de más hace nacer la devolución donde está (Aduana, Bodega o las dos) y baja lo recibido de la línea; autorizarlo no mueve nada", () => {
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

	/** Las devoluciones al proveedor de una orden: dónde esperan y cuánto. */
	function devoluciones(ordenId: string) {
		return consultar(
			`SELECT u.codigo AS donde, t.estado, t.destino_externo, l.cantidad_enviada AS cantidad
			 FROM traspasos t JOIN traspaso_lineas l ON l.traspaso_id = t.id JOIN ubicaciones u ON u.id = t.origen_ubicacion_id
			 WHERE t.tipo = 'devolucion_proveedor' AND t.orden_compra_id = $1 ORDER BY u.codigo`,
			[ordenId],
		);
	}

	it("autorizado, lo de más se queda: no nace nada y la orden sigue recibida", async () => {
		const orden = await ordenParaRecibir(servidor);
		await recibirDePrueba(servidor, orden, [{ metros: "100", partida: "A" }], 520);
		expect((await decidirDePrueba(servidor, await laDeMas(orden.lineaAvio), { decision: "autorizar" })).estado).toBe(
			200,
		);
		expect(await devoluciones(orden.id)).toEqual([]);
		expect(await consultar("SELECT estado FROM ordenes_compra WHERE id = $1", [orden.id])).toEqual([
			{ estado: "recibida" },
		]);
	});

	it("rechazado con todo en aduana, la devolución espera en Aduana y lo recibido de la línea baja", async () => {
		const orden = await ordenParaRecibir(servidor);
		await recibirDePrueba(servidor, orden, [{ metros: "110", partida: "A" }], 500);
		const rechazo = await decidirDePrueba(servidor, await laDeMas(orden.lineaTela), {
			decision: "rechazar",
			motivo: "No pedimos tanta tela",
		});
		expect(rechazo.estado).toBe(200);
		expect(await devoluciones(orden.id)).toEqual([
			{ donde: "ADU", estado: "esperado", destino_externo: "proveedor", cantidad: "10.000" },
		]);
		const recibido = await consultar(
			`SELECT sum(rl.cantidad_contada)::text AS contado FROM recepcion_lineas rl WHERE rl.orden_compra_linea_id = $1`,
			[orden.lineaTela],
		);
		expect(recibido).toEqual([{ contado: "110.000" }]);
		// Para Compras, lo recibido de la línea ya es lo pedido.
		const { rows } = await servidor.base.dueno.query("SELECT estado FROM ordenes_compra WHERE id = $1", [orden.id]);
		expect(rows).toEqual([{ estado: "recibida" }]);
	});

	it("rechazado con parte ya despachada a Bodega, nace una devolución por lado", async () => {
		const orden = await ordenParaRecibir(servidor);
		await recibirDePrueba(servidor, orden, [{ metros: "110", partida: "A" }], 500);
		// Como si Aduana ya hubiera despachado 106 m de su A- a Bodega: en aduana quedan 4.
		await servidor.base.dueno.query(
			`UPDATE traspaso_lineas SET cantidad_repartida = 106 WHERE material_id = $1
			 AND traspaso_id IN (SELECT id FROM traspasos WHERE orden_compra_id = $2 AND tipo = 'material_proveedor')`,
			[orden.tela, orden.id],
		);
		await decidirDePrueba(servidor, await laDeMas(orden.lineaTela), { decision: "rechazar", motivo: "No la pedimos" });
		expect(await devoluciones(orden.id)).toEqual([
			{ donde: "ADU", estado: "esperado", destino_externo: "proveedor", cantidad: "4.000" },
			{ donde: "BOD", estado: "esperado", destino_externo: "proveedor", cantidad: "6.000" },
		]);
	});
});
