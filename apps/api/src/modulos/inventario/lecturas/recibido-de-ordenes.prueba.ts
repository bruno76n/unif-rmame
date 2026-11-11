/**
 * Prueba de `inventario.recibido_de_ordenes`: lo recibido de cada línea (menos lo rechazado que regresa) y las
 * recepciones de cada orden con su día; con eso la orden pasa a recibida o recibida en parte, y lo que falta en camino
 * sale de las recepciones.
 * Fase 11 · docs/fases/11-aduana-y-bodega.md (parte 1)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { decidirDePrueba, ordenParaRecibir, recibirDePrueba } from "../../../nucleo/pruebas/aduana-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("La orden pasa a recibida o recibida en parte con lo recibido; lo que falta en camino sale de las recepciones", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Lee una lectura como lo haría Compras. */
	function leer(nombre: string, datos: Record<string, unknown>) {
		return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.lectura(nombre, datos),
		);
	}

	it("lo recibido por línea y las recepciones por orden; la orden en parte, lo que falta en camino; lo rechazado baja lo recibido", async () => {
		const orden = await ordenParaRecibir(servidor);
		await recibirDePrueba(servidor, orden, [{ metros: "60", partida: "A" }]);
		expect(
			await leer("inventario.recibido_de_ordenes", {
				orden_compra_linea_ids: [orden.lineaTela, orden.lineaAvio],
				orden_compra_ids: [orden.id],
			}),
		).toEqual({
			lineas: { [orden.lineaTela]: "60.000" },
			recepciones: {
				[orden.id]: [{ recepcion_id: expect.any(String), dia: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }],
			},
		});
		const { rows } = await servidor.base.dueno.query("SELECT estado FROM ordenes_compra WHERE id = $1", [orden.id]);
		expect(rows).toEqual([{ estado: "recibida_en_parte" }]);
		// Para Aduana, lo que falta de la tela son 40 m; del avío, todo.
		const porRecibir = await leer("compras.ordenes_por_recibir", { orden_compra_ids: [orden.id] });
		expect(porRecibir).toMatchObject({
			ordenes: [
				{ lineas: expect.arrayContaining([expect.objectContaining({ material_id: orden.tela, falta: "40.000" })]) },
			],
		});
		// 50 m más: 110 de 100; rechazados los 10 de más, lo recibido de la línea es 100.
		await recibirDePrueba(servidor, orden, [{ metros: "50", partida: "A" }], 500);
		const { rows: au } = await servidor.base.dueno.query(
			"SELECT id FROM autorizaciones WHERE orden_compra_linea_id = $1",
			[orden.lineaTela],
		);
		await decidirDePrueba(servidor, String(au[0]?.id), { decision: "rechazar", motivo: "No la pedimos" });
		expect(await leer("inventario.recibido_de_ordenes", { orden_compra_linea_ids: [orden.lineaTela] })).toMatchObject({
			lineas: { [orden.lineaTela]: "100.000" },
		});
	});
});
