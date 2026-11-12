/**
 * Prueba de `inventario.no_la_encuentro`: la pieza apartada para un pedido externo que Bodega no encuentra abre su DF-
 * por contar y su reserva se libera; una que ya no está apartada no.
 * Fase 16 · docs/fases/16-ventas-a-externos.md (parte 4)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { meterPiezas, ubicacionesPorCodigo, variantesLibres } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { pedidoDePrueba } from "../../../nucleo/pruebas/ventas-de-prueba.ts";

describe("«No la encuentro» abre la DF- por contar y la pieza vuelve a lo que falta mandar del pedido", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("la DF- nace por contar en Bodega con lo que decía el sistema; la reserva se libera; otra vez, `reserva_no_activa`", async () => {
		const ubicacion = await ubicacionesPorCodigo(servidor);
		const [variante = ""] = await variantesLibres(servidor, 1);
		const pedido = await pedidoDePrueba(servidor);
		await meterPiezas(servidor, ubicacion.BOD ?? "", variante, 5);
		const reserva = uuidv7();
		await servidor.base.dueno.query(
			`INSERT INTO reservas (id, ubicacion_id, variante_id, piezas, motivo, pedido_id, estado)
			 VALUES ($1, $2, $3, 2, 'pedido_externo', $4, 'activa')`,
			[reserva, ubicacion.BOD, variante, pedido],
		);
		const buscar = () =>
			mandarAccion(
				servidor,
				"inventario.no_la_encuentro",
				{ datos: { reserva_id: reserva, nota: "No está en su anaquel" } },
				"bodega",
			);
		const respuesta = await buscar();
		const { rows: folio } = await servidor.base.dueno.query("SELECT folio FROM pedidos WHERE id = $1", [pedido]);
		expect(respuesta.cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(
				new RegExp(`^DF-\\d+: .+ talla .+ queda en diferencias\\. Vuelve a lo que falta mandar de ${folio[0]?.folio}$`),
			),
		});
		const { rows } = await servidor.base.dueno.query(
			`SELECT d.origen, d.estado, d.piezas, d.sistema_decia, u.codigo FROM diferencias d
			 JOIN ubicaciones u ON u.id = d.ubicacion_id WHERE d.variante_id = $1`,
			[variante],
		);
		expect(rows).toEqual([
			{ origen: "no_la_encontro", estado: "por_contar", piezas: -2, sistema_decia: 5, codigo: "BOD" },
		]);
		const { rows: suya } = await servidor.base.dueno.query(
			"SELECT estado, motivo_fin, nota_fin FROM reservas WHERE id = $1",
			[reserva],
		);
		expect(suya).toEqual([{ estado: "liberada", motivo_fin: "no_la_encontro", nota_fin: "No está en su anaquel" }]);
		expect((await buscar()).cuerpo).toMatchObject({
			codigo: "reserva_no_activa",
			mensaje: "Esa pieza ya no está apartada aquí.",
		});
	});
});
