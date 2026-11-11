/**
 * Prueba de `inventario.actualizar_costo_rollos`: la nota que corrige un precio cambia el costo de todos los rollos de
 * esa línea, y los de otra línea no.
 * Fase 11 · docs/fases/11-aduana-y-bodega.md (parte 1)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { ordenParaRecibir, recibirDePrueba } from "../../../nucleo/pruebas/aduana-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("La nota que corrige un precio cambia el costo de todos los rollos de esa línea", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** El costo de los rollos de una orden. */
	async function costos(ordenId: string) {
		const { rows } = await servidor.base.dueno.query(
			"SELECT costo_metro_centavos::int AS costo FROM rollos WHERE orden_compra_id = $1 ORDER BY folio",
			[ordenId],
		);
		return rows.map((fila) => fila.costo);
	}

	it("la nota de Contaduría cambia el costo de los dos rollos de la línea; los de otra orden no cambian", async () => {
		const orden = await ordenParaRecibir(servidor);
		const otra = await ordenParaRecibir(servidor);
		await recibirDePrueba(servidor, orden, [
			{ metros: "50", partida: "A" },
			{ metros: "50", partida: "B" },
		]);
		await recibirDePrueba(servidor, otra, [{ metros: "100", partida: "A" }]);
		expect(await costos(orden.id)).toEqual([7_800, 7_800]);
		await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.interna("compras.registrar_precios_nota", {
				orden_compra_id: orden.id,
				lineas: [{ orden_compra_linea_id: orden.lineaTela, precio_centavos: 8_200 }],
			}),
		);
		expect(await costos(orden.id)).toEqual([8_200, 8_200]);
		expect(await costos(otra.id)).toEqual([7_800]);
	});
});
