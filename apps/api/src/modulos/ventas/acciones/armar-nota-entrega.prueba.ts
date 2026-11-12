/**
 * Prueba de `ventas.armar_nota_entrega`: la nota lleva lo listo en aduana al precio del pedido y con su anticipo, con su
 * número en el pedido, y nunca más de lo listo; el avance del pedido cuenta lo que va en nota.
 * Fase 16 · docs/fases/16-ventas-a-externos.md («Criterios de terminado»)
 */

import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
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

describe("La nota solo lleva lo listo, al precio del pedido y con su anticipo", () => {
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

	/** Ventas arma una nota con tantas piezas de la talla 4. */
	async function armar(pedidoId: string, cantidad: number) {
		return mandarAccion(
			servidor,
			"ventas.armar_nota_entrega",
			{
				datos: { pedido_id: pedidoId, renglones: [{ variante_id: prenda.variantes["4"], cantidad }] },
				version: await versionDelPedido(servidor, pedidoId),
			},
			"ventas",
		);
	}

	/** Lo que regresó armar una nota. */
	function armada(respuesta: { cuerpo: { resultado?: unknown } }) {
		return z
			.object({
				nota_id: z.uuid(),
				folio: z.string(),
				subtotal_centavos: z.number(),
				anticipo_centavos: z.number(),
				por_cobrar_centavos: z.number(),
				mensaje: z.string(),
			})
			.parse(respuesta.cuerpo.resultado);
	}

	/** Lo que lee Ventas de un pedido con una de sus lecturas. */
	function leer(lectura: string, pedidoId: string) {
		return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.lectura(lectura, { pedido_id: pedidoId }),
		);
	}

	/** El avance de un pedido: sus tallas y su etapa. */
	async function avanceDe(pedidoId: string) {
		return z
			.object({ etapa: z.string(), tallas: z.array(z.record(z.string(), z.unknown())) })
			.parse(await leer("ventas.avance_pedido", pedidoId));
	}

	/** Lo que Contaduría lee de un pedido para cobrarle. */
	async function pedidoParaCobro(pedidoId: string) {
		return z.record(z.string(), z.unknown()).parse(await leer("ventas.pedido_para_cobro", pedidoId));
	}

	/** Lo disponible del anticipo de un pedido. */
	async function disponible(pedidoId: string): Promise<number> {
		const [fila] = await consultar(
			`SELECT coalesce(sum(CASE WHEN tipo IN ('recibido', 'regresado') THEN monto_centavos ELSE -monto_centavos END), 0)::int AS d
			 FROM anticipos WHERE pedido_id = $1 AND estado = 'vigente'`,
			[pedidoId],
		);
		return z.number().parse(fila?.d);
	}

	it("armar: la nota lleva lo listo al precio del pedido y descuenta su anticipo; nota i de n; nunca más de lo listo", async () => {
		const { pedido, precio } = await pedidoConListo(10, 10, 100_000);
		const primera = armada(await armar(pedido.pedido_id, 6));
		expect(primera).toMatchObject({
			folio: expect.stringMatching(/^NV-\d{4}$/),
			subtotal_centavos: 6 * precio,
			anticipo_centavos: Math.min(100_000, 6 * precio),
			por_cobrar_centavos: 6 * precio - Math.min(100_000, 6 * precio),
			mensaje: `${primera.folio} lista: 6 piezas por despachar en aduana`,
		});
		expect(await disponible(pedido.pedido_id)).toBe(100_000 - primera.anticipo_centavos);
		const segunda = armada(await armar(pedido.pedido_id, 4));
		expect(
			await consultar("SELECT numero_en_pedido AS n, estado FROM notas_entrega WHERE pedido_id = $1 ORDER BY n", [
				pedido.pedido_id,
			]),
		).toEqual([
			{ n: 1, estado: "por_despachar" },
			{ n: 2, estado: "por_despachar" },
		]);
		expect(segunda.subtotal_centavos).toBe(4 * precio);
		// Ya no queda nada listo.
		expect((await armar(pedido.pedido_id, 1)).cuerpo).toMatchObject({ codigo: "nada_listo" });
		// En el avance, las 10 van en nota y nada queda listo; Aduana no arma notas.
		expect((await avanceDe(pedido.pedido_id)).tallas).toEqual([
			expect.objectContaining({ pedido: 10, en_nota: 10, listo: 0, entregado: 0, falta: 0 }),
		]);
		expect(
			(
				await mandarAccion(
					servidor,
					"ventas.armar_nota_entrega",
					{
						datos: { pedido_id: pedido.pedido_id, renglones: [{ variante_id: prenda.variantes["4"], cantidad: 1 }] },
						version: await versionDelPedido(servidor, pedido.pedido_id),
					},
					"aduana",
				)
			).estado,
		).toBe(403);
	});

	it("un pedido con notas no se cancela, y su avance cuenta lo que va en nota", async () => {
		const { pedido } = await pedidoConListo(10, 4);
		const nota = armada(await armar(pedido.pedido_id, 4));
		expect(await avanceDe(pedido.pedido_id)).toMatchObject({
			etapa: "entrega_parcial",
			tallas: [expect.objectContaining({ en_nota: 4, falta: 6 })],
		});
		// Lo de sus notas no canceladas, para Contaduría.
		expect(await pedidoParaCobro(pedido.pedido_id)).toMatchObject({ notas_centavos: nota.subtotal_centavos });
		expect(
			(
				await mandarAccion(
					servidor,
					"ventas.cancelar_pedido",
					{
						datos: { pedido_id: pedido.pedido_id, motivo: "Ya no lo quiere" },
						version: await versionDelPedido(servidor, pedido.pedido_id),
					},
					"ventas",
				)
			).cuerpo,
		).toMatchObject({
			codigo: "pedido_con_notas",
			mensaje: `${pedido.folio} ya tiene notas de entrega: no se puede cancelar.`,
		});
	});
});
