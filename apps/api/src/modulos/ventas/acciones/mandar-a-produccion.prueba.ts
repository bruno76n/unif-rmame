/**
 * Prueba de `ventas.mandar_a_produccion`: primero se surte lo libre y lo que falta va a producción, nunca más de lo
 * que falta; suma a un lote sin cortar o abre su orden.
 * Fase 16 · docs/fases/16-ventas-a-externos.md («Criterios de terminado»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { meterPiezas, ubicacionesPorCodigo } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import type { PrendaDelTaller } from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import {
	darDeAltaClienteDePrueba,
	pedidoConfirmadoDePrueba,
	prendaParaVender,
	versionDelPedido,
} from "../../../nucleo/pruebas/ventas-de-prueba.ts";

describe("Mandar a producción nunca manda más de lo que falta, y suma a un lote sin cortar o abre su orden", () => {
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

	/** Un pedido confirmado de 40 de la talla 4 y 10 de la 6. */
	async function pedido() {
		const cliente = await darDeAltaClienteDePrueba(servidor);
		return pedidoConfirmadoDePrueba(servidor, {
			cliente_id: cliente.cliente_id,
			renglones: [
				{ variante_id: prenda.variantes["4"], cantidad: 40 },
				{ variante_id: prenda.variantes["6"], cantidad: 10 },
			],
		});
	}

	/** Una acción de la revisión sobre un pedido, con su versión. */
	async function revision(accion: string, pedidoId: string, datos: Record<string, unknown> = {}) {
		return mandarAccion(
			servidor,
			`ventas.${accion}`,
			{ datos: { pedido_id: pedidoId, ...datos }, version: await versionDelPedido(servidor, pedidoId) },
			"ventas",
		);
	}

	/** Cuántas reservas activas tiene el pedido. */
	async function reservasActivas(pedidoId: string) {
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM reservas WHERE pedido_id = $1 AND estado = 'activa'",
			[pedidoId],
		);
		return rows[0]?.n;
	}

	it("con 12 libres de la talla 4, surtir aparta 12 y las 28 que faltan van a producción en una orden nueva; después, se suman a su lote", async () => {
		const elPedido = await pedido();
		await meterPiezas(servidor, ubicacion.BOD ?? "", prenda.variantes["4"] ?? "", 12);
		const surtido = await revision("surtir_de_bodega", elPedido.pedido_id, { producto_id: prenda.productoId });
		expect(surtido.cuerpo.resultado).toMatchObject({
			mensaje: `12 piezas se apartan en bodega para ${elPedido.folio}. A producción va solo lo que falta`,
			piezas: 12,
			por_mandar: 38,
		});
		expect(await reservasActivas(elPedido.pedido_id)).toBe(1);
		const mandado = await revision("mandar_a_produccion", elPedido.pedido_id, {
			renglones: [{ variante_id: prenda.variantes["4"], piezas: 28 }],
		});
		expect(mandado.cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(new RegExp(`^${elPedido.folio}: 28 piezas a producción: OP-.+ con el lote L-`)),
			piezas: 28,
			lotes: [expect.objectContaining({ nuevo: true, piezas: 28 })],
		});
		// La talla 4 ya no tiene nada por mandar; la 6 se suma al mismo lote, que no se ha cortado.
		expect(
			(
				await revision("mandar_a_produccion", elPedido.pedido_id, {
					renglones: [{ variante_id: prenda.variantes["4"], piezas: 1 }],
				})
			).cuerpo,
		).toMatchObject({
			codigo: "piezas_de_mas_por_mandar",
			mensaje: `${prenda.nombre} talla 4: solo faltan 0 por mandar.`,
		});
		const resto = await revision("mandar_a_produccion", elPedido.pedido_id);
		expect(resto.cuerpo.resultado).toMatchObject({
			piezas: 10,
			mensaje: expect.stringMatching(/se suman a L-.+, que todavía no se corta$/),
			lotes: [expect.objectContaining({ nuevo: false, piezas: 10 })],
		});
		expect((await revision("mandar_a_produccion", elPedido.pedido_id)).cuerpo).toMatchObject({
			codigo: "nada_por_mandar",
			mensaje: "Todo el pedido ya está en producción.",
		});
	});
});
