/**
 * Prueba de `ventas.cancelar_nota_entrega`: cancelar una nota antes de que salga regresa sus piezas a lo listo del pedido
 * y su anticipo al pedido; su número no se reusa.
 * Fase 16 · docs/fases/16-ventas-a-externos.md («Criterios de terminado»)
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

describe("Cancelar una nota regresa sus piezas y su anticipo", () => {
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

	/** La versión de una nota. */
	async function versionDeNota(notaId: string): Promise<number> {
		const [fila] = await consultar("SELECT version::int AS v FROM notas_entrega WHERE id = $1", [notaId]);
		return z.number().parse(fila?.v);
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

	it("cancelar antes de salir: sus piezas vuelven a lo listo y su anticipo al pedido; después, `nota_ya_salio`", async () => {
		const { pedido } = await pedidoConListo(10, 10, 50_000);
		const nota = armada(await armar(pedido.pedido_id, 10));
		expect(await disponible(pedido.pedido_id)).toBe(50_000 - nota.anticipo_centavos);
		const cancelar = async () =>
			mandarAccion(
				servidor,
				"ventas.cancelar_nota_entrega",
				{
					datos: { nota_id: nota.nota_id, motivo: "El cliente pidió otra fecha" },
					version: await versionDeNota(nota.nota_id),
				},
				"ventas",
			);
		const cancelada = await cancelar();
		expect(cancelada.cuerpo.resultado).toMatchObject({
			mensaje: `${nota.folio} cancelada: sus piezas regresan a lo listo del pedido ${pedido.folio}`,
		});
		expect(await disponible(pedido.pedido_id)).toBe(50_000);
		expect(
			await consultar(
				"SELECT motivo, piezas FROM reservas WHERE pedido_id = $1 AND estado = 'activa' ORDER BY motivo",
				[pedido.pedido_id],
			),
		).toEqual([{ motivo: "pedido_externo", piezas: 10 }]);
		expect((await cancelar()).cuerpo).toMatchObject({ codigo: "nota_ya_salio" });
		// Una nota nueva toma el número que sigue: el 1 no se reusa.
		const otra = armada(await armar(pedido.pedido_id, 2));
		expect(await consultar("SELECT numero_en_pedido AS n FROM notas_entrega WHERE id = $1", [otra.nota_id])).toEqual([
			{ n: 2 },
		]);
	});
});
