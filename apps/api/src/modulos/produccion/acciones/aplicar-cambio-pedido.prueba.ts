/**
 * Prueba de `produccion.aplicar_cambio_pedido`: aplicar un cambio resta de los lotes sin cortar, manda a Bodega lo ya
 * cortado, cancela lo que queda en cero y reemplaza los cambios viejos.
 * Fase 16 · docs/fases/16-ventas-a-externos.md («Criterios de terminado»)
 */

import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { siembraDelCatalogo } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { type PrendaDelTaller, prendaParaCortar } from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import {
	darDeAltaClienteDePrueba,
	pedidoConfirmadoDePrueba,
	prendaParaVender,
	versionDelPedido,
} from "../../../nucleo/pruebas/ventas-de-prueba.ts";

describe("Aplicar un cambio resta de los lotes sin cortar, manda a Bodega lo cortado, cancela lo que queda en cero y reemplaza los viejos", () => {
	let servidor: ServidorDePrueba;
	let prenda: PrendaDelTaller;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		prenda = await prendaParaVender(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** La fecha de entrega de los pedidos de la prueba. */
	const entrega = Temporal.Now.plainDateISO("America/Mexico_City").add({ days: 30 }).toString();

	/** Un pedido de 20 de la talla 4 de una prenda, mandado a producción. */
	async function pedidoEnProduccion(laPrenda: PrendaDelTaller = prenda) {
		const cliente = await darDeAltaClienteDePrueba(servidor);
		const pedido = await pedidoConfirmadoDePrueba(servidor, {
			cliente_id: cliente.cliente_id,
			fecha_entrega: entrega,
			renglones: [{ variante_id: laPrenda.variantes["4"], cantidad: 20 }],
		});
		const mandado = await mandarAccion(
			servidor,
			"ventas.mandar_a_produccion",
			{ datos: { pedido_id: pedido.pedido_id }, version: await versionDelPedido(servidor, pedido.pedido_id) },
			"ventas",
		);
		const { lotes } = z.object({ lotes: z.array(z.object({ lote_id: z.uuid() })) }).parse(mandado.cuerpo.resultado);
		return { cliente, pedido, loteId: lotes[0]?.lote_id ?? "" };
	}

	/** Ventas baja la talla 4 a tantas piezas. */
	async function bajar(pedidoId: string, clienteId: string, cantidad: number, laPrenda: PrendaDelTaller = prenda) {
		return mandarAccion(
			servidor,
			"ventas.guardar_version_pedido",
			{
				datos: {
					pedido_id: pedidoId,
					cliente_id: clienteId,
					fecha_entrega: entrega,
					forma_pago: "contado",
					renglones: [{ variante_id: laPrenda.variantes["4"], cantidad }],
				},
				version: await versionDelPedido(servidor, pedidoId),
			},
			"ventas",
		);
	}

	/** Los cambios de un pedido, por su versión. */
	async function cambios(pedidoId: string) {
		const { rows } = await servidor.base.dueno.query(
			`SELECT c.id, c.version::int AS v, c.estado, pv.numero FROM cambios_pedido c
			 JOIN pedido_versiones pv ON pv.id = c.pedido_version_id WHERE c.pedido_id = $1 ORDER BY pv.numero`,
			[pedidoId],
		);
		return rows;
	}

	/** Producción aplica un cambio. */
	function aplicar(cambio: { id: string; v: number }) {
		return mandarAccion(
			servidor,
			"produccion.aplicar_cambio_pedido",
			{ datos: { cambio_pedido_id: cambio.id }, version: cambio.v },
			"produccion",
		);
	}

	/** Las piezas de la talla 4 de un lote y su estado. */
	async function lote(loteId: string) {
		const { rows } = await servidor.base.dueno.query(
			`SELECT l.estado, t.piezas_planeadas AS planeadas, t.piezas_a_bodega AS a_bodega,
				(SELECT estado FROM ordenes_produccion o WHERE o.id = l.orden_produccion_id) AS orden
			 FROM lotes l JOIN lote_tallas t ON t.lote_id = l.id WHERE l.id = $1`,
			[loteId],
		);
		return rows[0];
	}

	it("dos versiones bajan a 5 y a 3: aplicar la vieja aplica la nueva, resta 17 del lote por cortar y la vieja queda reemplazada", async () => {
		const { cliente, pedido, loteId } = await pedidoEnProduccion();
		expect((await bajar(pedido.pedido_id, cliente.cliente_id, 5)).cuerpo.resultado).toMatchObject({ de_mas: 15 });
		await bajar(pedido.pedido_id, cliente.cliente_id, 3);
		const [vieja, nueva] = await cambios(pedido.pedido_id);
		expect([vieja?.estado, nueva?.estado]).toEqual(["por_aplicar", "por_aplicar"]);
		const aplicado = await aplicar({ id: vieja?.id, v: vieja?.v });
		expect(aplicado.cuerpo.resultado).toMatchObject({
			mensaje: `${pedido.folio} versión 3 aplicada en producción`,
			cambio_pedido_id: nueva?.id,
			lineas: 1,
		});
		expect(await lote(loteId)).toEqual({ estado: "por_cortar", planeadas: 3, a_bodega: 0, orden: "abierta" });
		// La bitácora lleva las planeadas de antes y de después, y el estado de los lotes tocados.
		const { rows: bitacora } = await servidor.base.dueno.query(
			"SELECT antes, despues FROM bitacora WHERE entidad = 'cambios_pedido' AND entidad_id = $1",
			[nueva?.id],
		);
		expect(bitacora).toEqual([
			{
				antes: {
					lineas: [expect.objectContaining({ lote_id: loteId, piezas_planeadas: 20, piezas_a_bodega: 0 })],
					lotes: [{ lote_id: loteId, estado: "por_cortar" }],
				},
				despues: {
					lineas: [expect.objectContaining({ lote_id: loteId, piezas_planeadas: 3, piezas_a_bodega: 0 })],
					lotes_cancelados: [],
					ordenes_canceladas: [],
				},
			},
		]);
		expect((await cambios(pedido.pedido_id)).map((cambio) => cambio.estado)).toEqual(["reemplazado", "aplicado"]);
		const [otraVez] = await cambios(pedido.pedido_id);
		expect((await aplicar({ id: otraVez?.id, v: otraVez?.v })).cuerpo).toMatchObject({ codigo: "cambio_ya_aplicado" });
	});

	it("un lote por cortar que queda en 0 se cancela con su orden", async () => {
		const otra = await prendaParaVender(servidor);
		const cliente = await darDeAltaClienteDePrueba(servidor);
		const pedido = await pedidoConfirmadoDePrueba(servidor, {
			cliente_id: cliente.cliente_id,
			fecha_entrega: entrega,
			renglones: [
				{ variante_id: prenda.variantes["4"], cantidad: 20 },
				{ variante_id: otra.variantes["4"], cantidad: 2 },
			],
		});
		const mandado = await mandarAccion(
			servidor,
			"ventas.mandar_a_produccion",
			{
				datos: { pedido_id: pedido.pedido_id, renglones: [{ variante_id: prenda.variantes["4"], piezas: 20 }] },
				version: await versionDelPedido(servidor, pedido.pedido_id),
			},
			"ventas",
		);
		const { lotes } = z.object({ lotes: z.array(z.object({ lote_id: z.uuid() })) }).parse(mandado.cuerpo.resultado);
		await mandarAccion(
			servidor,
			"ventas.guardar_version_pedido",
			{
				datos: {
					pedido_id: pedido.pedido_id,
					cliente_id: cliente.cliente_id,
					fecha_entrega: entrega,
					forma_pago: "contado",
					renglones: [
						{ variante_id: prenda.variantes["4"], cantidad: 0 },
						{ variante_id: otra.variantes["4"], cantidad: 2 },
					],
				},
				version: await versionDelPedido(servidor, pedido.pedido_id),
			},
			"ventas",
		);
		const [cambio] = await cambios(pedido.pedido_id);
		await aplicar({ id: cambio?.id, v: cambio?.v });
		expect(await lote(lotes[0]?.lote_id ?? "")).toEqual({
			estado: "cancelado",
			planeadas: 0,
			a_bodega: 0,
			orden: "cancelada",
		});
	});

	it("de un lote ya cortado, lo de más va a Bodega sin pasar de lo cortado − merma", async () => {
		const cortable = await prendaParaCortar(servidor, await siembraDelCatalogo(servidor));
		await servidor.base.dueno.query("UPDATE productos SET canal_externos = true WHERE id = $1", [cortable.productoId]);
		const { cliente, pedido, loteId } = await pedidoEnProduccion(cortable);
		// El lote ya se cortó con su receta: 20 cortadas, 2 de merma.
		await servidor.base.dueno.query(
			"UPDATE lotes SET estado = 'en_proceso', cortado_en = now(), flujo_id = $2, receta_version_id = $3 WHERE id = $1",
			[loteId, cortable.flujo.flujoId, cortable.recetaVersionId],
		);
		await servidor.base.dueno.query(
			"UPDATE lote_tallas SET piezas_cortadas = 20, piezas_merma = 2 WHERE lote_id = $1",
			[loteId],
		);
		await bajar(pedido.pedido_id, cliente.cliente_id, 4, cortable);
		const [cambio] = await cambios(pedido.pedido_id);
		await aplicar({ id: cambio?.id, v: cambio?.v });
		expect(await lote(loteId)).toEqual({ estado: "en_proceso", planeadas: 20, a_bodega: 14, orden: "abierta" });
	});
});
