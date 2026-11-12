/**
 * Prueba de `ventas.cancelar_pedido`: sus lotes pasan a temporada, lo que tiene en aduana y lo que viene en camino
 * regresa a Bodega, sus reservas se liberan y su anticipo queda a favor; un pedido con notas no se cancela.
 * Fase 16 · docs/fases/16-ventas-a-externos.md («Criterios de terminado»)
 */

import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { versionDeTraspaso } from "../../../nucleo/pruebas/aduana-de-prueba.ts";
import { saldoAFavorDePrueba } from "../../../nucleo/pruebas/contaduria-de-prueba.ts";
import {
	listoEnAduanaDePrueba,
	llamarInterna,
	meterPiezas,
	ubicacionesPorCodigo,
} from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import type { PrendaDelTaller } from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import {
	darDeAltaClienteDePrueba,
	notaDePrueba,
	pedidoConfirmadoDePrueba,
	prendaParaVender,
	versionDelPedido,
	versionVigenteDePrueba,
} from "../../../nucleo/pruebas/ventas-de-prueba.ts";

describe("Cancelar un pedido deja todo en su lugar", () => {
	let servidor: ServidorDePrueba;
	let prenda: PrendaDelTaller;
	let ubicacion: Record<string, string>;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		prenda = await prendaParaVender(servidor);
		ubicacion = await ubicacionesPorCodigo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** La fecha de entrega de los pedidos de la prueba. */
	const entrega = () => Temporal.Now.plainDateISO("America/Mexico_City").add({ days: 30 }).toString();

	it("cancelar: sus lotes van a temporada, lo apartado se libera y su anticipo pasa a favor; otra vez, `pedido_terminado`", async () => {
		const cliente = await darDeAltaClienteDePrueba(servidor);
		const pedido = await pedidoConfirmadoDePrueba(servidor, {
			cliente_id: cliente.cliente_id,
			fecha_entrega: entrega(),
			forma_pago: "anticipo",
			renglones: [
				{ variante_id: prenda.variantes["4"], cantidad: 10 },
				{ variante_id: prenda.variantes["8"], cantidad: 4 },
			],
		});
		const pago = await mandarAccion(
			servidor,
			"contaduria.registrar_pago_recibido",
			{
				datos: {
					cliente_id: cliente.cliente_id,
					pedido_id: pedido.pedido_id,
					monto_centavos: 100_000,
					medio: "efectivo",
				},
			},
			"contaduria",
		);
		expect(pago.estado).toBe(200);
		const mandado = z.object({ lotes: z.array(z.object({ lote_id: z.uuid() })) }).parse(
			await llamarInterna(servidor, "produccion.mandar_a_produccion", {
				pedido_id: pedido.pedido_id,
				pedido_version_id: await versionVigenteDePrueba(servidor, pedido.pedido_id),
				fecha_entrega: entrega(),
				renglones: [{ variante_id: prenda.variantes["4"], piezas: 10 }],
			}),
		);
		await meterPiezas(servidor, ubicacion.BOD ?? "", prenda.variantes["8"] ?? "", 4);
		await llamarInterna(servidor, "inventario.reservar", {
			motivo: "pedido_externo",
			pedido_id: pedido.pedido_id,
			renglones: [{ variante_id: prenda.variantes["8"], piezas: 4 }],
		});
		const cancelar = async () =>
			mandarAccion(
				servidor,
				"ventas.cancelar_pedido",
				{
					datos: { pedido_id: pedido.pedido_id, motivo: "El cliente ya no lo quiere" },
					version: await versionDelPedido(servidor, pedido.pedido_id),
				},
				"ventas",
			);
		expect((await cancelar()).cuerpo.resultado).toMatchObject({
			mensaje: `${pedido.folio} cancelado. Queda en el historial con su motivo`,
		});
		const { rows } = await servidor.base.dueno.query(
			`SELECT (SELECT destino FROM lotes WHERE id = $2) AS lote,
				(SELECT count(*)::int FROM reservas WHERE pedido_id = $1 AND estado = 'activa') AS activas,
				(SELECT estado FROM pedidos WHERE id = $1) AS estado`,
			[pedido.pedido_id, mandado.lotes[0]?.lote_id],
		);
		expect(rows).toEqual([{ lote: "temporada", activas: 0, estado: "cancelado" }]);
		expect(await saldoAFavorDePrueba(servidor, cliente.cliente_id)).toBe(100_000);
		expect((await cancelar()).cuerpo).toMatchObject({
			codigo: "pedido_terminado",
			mensaje: `${pedido.folio} ya está cancelado.`,
		});
	});

	it("lo listo en aduana regresa a Bodega en un `regresa` al cancelar; lo que venía en camino, al recibirlo; con notas no se cancela", async () => {
		const cliente = await darDeAltaClienteDePrueba(servidor);
		const pedido = await pedidoConfirmadoDePrueba(servidor, {
			cliente_id: cliente.cliente_id,
			fecha_entrega: entrega(),
			renglones: [
				{ variante_id: prenda.variantes["4"], cantidad: 6 },
				{ variante_id: prenda.variantes["6"], cantidad: 3 },
			],
		});
		// 6 listas en aduana y 3 surtidas de bodega que vienen en camino.
		const listo = await listoEnAduanaDePrueba(servidor, pedido.pedido_id, prenda.variantes["4"] ?? "", 6);
		await meterPiezas(servidor, ubicacion.BOD ?? "", prenda.variantes["6"] ?? "", 3);
		await llamarInterna(servidor, "inventario.reservar", {
			motivo: "pedido_externo",
			pedido_id: pedido.pedido_id,
			renglones: [{ variante_id: prenda.variantes["6"], piezas: 3 }],
		});
		const surtido = await mandarAccion(
			servidor,
			"inventario.surtir_a_aduana",
			{ datos: { documento_tipo: "pedido_externo", documento_id: pedido.pedido_id } },
			"bodega",
		);
		const { traspaso_id: enCamino } = z.object({ traspaso_id: z.uuid() }).parse(surtido.cuerpo.resultado);
		const cancelado = await mandarAccion(
			servidor,
			"ventas.cancelar_pedido",
			{
				datos: { pedido_id: pedido.pedido_id, motivo: "El cliente ya no lo quiere" },
				version: await versionDelPedido(servidor, pedido.pedido_id),
			},
			"ventas",
		);
		expect(cancelado.estado).toBe(200);
		const hijos = async (padre: string) =>
			(
				await servidor.base.dueno.query(
					`SELECT t.tipo, d.codigo AS destino FROM traspasos t JOIN ubicaciones d ON d.id = t.destino_ubicacion_id
					 WHERE t.traspaso_padre_id = $1`,
					[padre],
				)
			).rows;
		expect(await hijos(listo.traspasoId)).toEqual([{ tipo: "regresa", destino: "BOD" }]);
		expect(await hijos(enCamino)).toEqual([]);
		await mandarAccion(
			servidor,
			"inventario.recibir_en_aduana",
			{ datos: { traspaso_id: enCamino, modo: "completo" }, version: await versionDeTraspaso(servidor, enCamino) },
			"aduana",
		);
		expect(await hijos(enCamino)).toEqual([{ tipo: "regresa", destino: "BOD" }]);
		// Un pedido con una nota no cancelada no se cancela.
		const otro = await pedidoConfirmadoDePrueba(servidor, {
			cliente_id: cliente.cliente_id,
			fecha_entrega: entrega(),
			renglones: [{ variante_id: prenda.variantes["4"], cantidad: 2 }],
		});
		await notaDePrueba(servidor, { pedidoId: otro.pedido_id });
		expect(
			(
				await mandarAccion(
					servidor,
					"ventas.cancelar_pedido",
					{
						datos: { pedido_id: otro.pedido_id, motivo: "Ya no lo quiere" },
						version: await versionDelPedido(servidor, otro.pedido_id),
					},
					"ventas",
				)
			).cuerpo,
		).toMatchObject({
			codigo: "pedido_con_notas",
			mensaje: `${otro.folio} ya tiene notas de entrega: no se puede cancelar.`,
		});
	});
});
