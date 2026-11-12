/**
 * Prueba de `inventario.surtir_a_aduana`: surtir pasa a En camino a aduana con su A- y sus reservas; sin la pieza en
 * Bodega no surte.
 * Fase 11 · docs/fases/11-aduana-y-bodega.md (parte 3)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { meterPiezas, ubicacionesPorCodigo, variantesLibres } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { pedidoDePrueba } from "../../../nucleo/pruebas/ventas-de-prueba.ts";

describe("Surtir pasa a En camino a aduana con su A- y sus reservas; sin la pieza en Bodega no surte", () => {
	let servidor: ServidorDePrueba;
	let ubicacion: Record<string, string>;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		ubicacion = await ubicacionesPorCodigo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Un pedido externo con piezas reservadas en Bodega. */
	async function pedidoReservado(hay: number, reservadas: number) {
		const [variante = ""] = await variantesLibres(servidor, 1);
		const pedido = await pedidoDePrueba(servidor);
		if (hay > 0) await meterPiezas(servidor, ubicacion.BOD ?? "", variante, hay);
		await servidor.base.dueno.query(
			`INSERT INTO reservas (id, ubicacion_id, variante_id, piezas, motivo, pedido_id, estado)
			 VALUES ($1, $2, $3, $4, 'pedido_externo', $5, 'activa')`,
			[uuidv7(), ubicacion.BOD, variante, reservadas, pedido],
		);
		return { variante, pedido };
	}

	/** Bodega surte un documento. */
	function surtir(documento_tipo: string, documento_id: string) {
		return mandarAccion(servidor, "inventario.surtir_a_aduana", { datos: { documento_tipo, documento_id } }, "bodega");
	}

	it("lo reservado de un pedido pasa a En camino a aduana con su A-, y la reserva viaja con él", async () => {
		const { variante, pedido } = await pedidoReservado(5, 3);
		const respuesta = await surtir("pedido_externo", pedido);
		expect(respuesta.cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(/^A-\d+: 3 piezas van a aduana\. Quedan en camino hasta que aduana las reciba$/),
		});
		const { rows: traspaso } = await servidor.base.dueno.query(
			"SELECT tipo, estado, destino_externo, pedido_id, enviado_en IS NOT NULL AS enviado FROM traspasos WHERE pedido_id = $1",
			[pedido],
		);
		expect(traspaso).toEqual([
			{
				tipo: "surtido_pedido_externo",
				estado: "en_camino_aduana",
				destino_externo: "cliente_externo",
				pedido_id: pedido,
				enviado: true,
			},
		]);
		const { rows: existencia } = await servidor.base.dueno.query(
			`SELECT u.codigo, e.piezas FROM existencias e JOIN ubicaciones u ON u.id = e.ubicacion_id
			 WHERE e.variante_id = $1 AND e.piezas <> 0 ORDER BY u.codigo`,
			[variante],
		);
		expect(existencia).toEqual([
			{ codigo: "BOD", piezas: 2 },
			{ codigo: "ECA", piezas: 3 },
		]);
		const { rows: reserva } = await servidor.base.dueno.query(
			`SELECT u.codigo, r.traspaso_id IS NOT NULL AS con_traspaso FROM reservas r JOIN ubicaciones u ON u.id = r.ubicacion_id
			 WHERE r.pedido_id = $1 AND r.estado = 'activa'`,
			[pedido],
		);
		expect(reserva).toEqual([{ codigo: "ECA", con_traspaso: true }]);
		// Ya surtido, no queda nada en Bodega para ese pedido.
		expect((await surtir("pedido_externo", pedido)).cuerpo).toMatchObject({
			codigo: "nada_en_bodega",
			mensaje: "Nada que surtir de bodega para ese pedido",
		});
	});

	it("sin la pieza en Bodega no surte: hay que pedirla a una tienda", async () => {
		const { pedido } = await pedidoReservado(1, 3);
		expect((await surtir("pedido_externo", pedido)).cuerpo).toMatchObject({
			codigo: "no_hay_en_bodega",
			mensaje: expect.stringMatching(/^No hay .+ en bodega: hay que pedirla a una tienda$/),
		});
		const { rows } = await servidor.base.dueno.query("SELECT count(*)::int AS n FROM traspasos WHERE pedido_id = $1", [
			pedido,
		]);
		expect(rows).toEqual([{ n: 0 }]);
	});
});
