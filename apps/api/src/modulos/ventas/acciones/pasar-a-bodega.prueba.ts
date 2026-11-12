/**
 * Prueba de `ventas.pasar_a_bodega`: lo listo que el cliente ya no quiere baja del pedido en una versión nueva con su
 * precio y se reparte hacia Bodega; nunca más de lo listo sin nota.
 * Fase 16 · docs/modulos/ventas/notas-de-entrega.md (regla 7)
 */

import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { listoEnAduanaDePrueba } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import type { PrendaDelTaller } from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import {
	darDeAltaClienteDePrueba,
	pedidoConfirmadoDePrueba,
	prendaParaVender,
	versionDelPedido,
} from "../../../nucleo/pruebas/ventas-de-prueba.ts";

describe("Pasar a bodega baja las piezas del pedido en una versión nueva y las manda a Bodega", () => {
	let servidor: ServidorDePrueba;
	let prenda: PrendaDelTaller;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		prenda = await prendaParaVender(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[]) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	/** Un pedido confirmado de tantas de la talla 4, con tantas listas en aduana y, si se dice, un anticipo pagado. */
	async function pedidoConListo(pide: number, listas: number, anticipoCentavos = 0) {
		const cliente = await darDeAltaClienteDePrueba(servidor);
		const pedido = await pedidoConfirmadoDePrueba(servidor, {
			cliente_id: cliente.cliente_id,
			fecha_entrega: Temporal.Now.plainDateISO("America/Mexico_City").add({ days: 30 }).toString(),
			renglones: [{ variante_id: prenda.variantes["4"], cantidad: pide }],
		});
		const variante = prenda.variantes["4"] ?? "";
		await listoEnAduanaDePrueba(servidor, pedido.pedido_id, variante, listas);
		if (anticipoCentavos > 0) {
			const pago = await mandarAccion(
				servidor,
				"contaduria.registrar_pago_recibido",
				{
					datos: {
						cliente_id: cliente.cliente_id,
						pedido_id: pedido.pedido_id,
						monto_centavos: anticipoCentavos,
						medio: "efectivo",
					},
				},
				"contaduria",
			);
			expect(pago.estado).toBe(200);
		}
		const [renglon] = await consultar(
			"SELECT precio_unitario_centavos::int AS precio FROM pedido_renglones WHERE pedido_id = $1 AND hasta_version IS NULL",
			[pedido.pedido_id],
		);
		return { cliente, pedido, variante, precio: z.number().parse(renglon?.precio) };
	}

	it("pasar a bodega: baja esas piezas del pedido en una versión nueva con su precio y las manda a Bodega; nunca más de lo listo", async () => {
		const { pedido, precio } = await pedidoConListo(10, 5);
		const pasar = async (piezas: number) =>
			mandarAccion(
				servidor,
				"ventas.pasar_a_bodega",
				{
					datos: {
						pedido_id: pedido.pedido_id,
						renglones: [{ variante_id: prenda.variantes["4"], piezas }],
						motivo: "El cliente ya no las quiere",
					},
					version: await versionDelPedido(servidor, pedido.pedido_id),
				},
				"ventas",
			);
		expect((await pasar(6)).cuerpo).toMatchObject({
			codigo: "piezas_de_mas",
			mensaje: `${prenda.nombre} talla 4: hay 5 listas en aduana sin nota.`,
		});
		expect((await pasar(2)).cuerpo.resultado).toMatchObject({
			mensaje: `2 piezas de ${pedido.folio} regresan a bodega. El pedido pasa a la versión 2`,
			numero: 2,
		});
		expect(
			await consultar(
				`SELECT cantidad, precio_unitario_centavos::int AS precio, desde_version FROM pedido_renglones
				 WHERE pedido_id = $1 AND hasta_version IS NULL`,
				[pedido.pedido_id],
			),
		).toEqual([{ cantidad: 8, precio, desde_version: 2 }]);
		expect(
			await consultar("SELECT origen FROM pedido_versiones WHERE pedido_id = $1 AND numero = 2", [pedido.pedido_id]),
		).toEqual([{ origen: "pasar_a_bodega" }]);
		expect(
			await consultar(
				`SELECT t.tipo, d.codigo AS destino, l.piezas_recibidas_aduana AS piezas FROM traspasos t
				 JOIN traspaso_lineas l ON l.traspaso_id = t.id JOIN ubicaciones d ON d.id = t.destino_ubicacion_id
				 WHERE t.tipo = 'quitado_de_pedido' AND t.traspaso_padre_id IN (SELECT id FROM traspasos WHERE pedido_id = $1)`,
				[pedido.pedido_id],
			),
		).toEqual([{ tipo: "quitado_de_pedido", destino: "BOD", piezas: 2 }]);
		expect(
			await consultar("SELECT sum(piezas)::int AS piezas FROM reservas WHERE pedido_id = $1 AND estado = 'activa'", [
				pedido.pedido_id,
			]),
		).toEqual([{ piezas: 3 }]);
	});
});
