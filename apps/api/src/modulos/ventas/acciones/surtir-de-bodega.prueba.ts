/**
 * Prueba de `ventas.surtir_de_bodega`: nunca aparta más de lo libre en Bodega, aun con dos revisiones a la vez.
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

describe("Surtir de bodega nunca aparta más de lo libre", () => {
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

	it("surtir más de lo libre: `bodega_sin_libres`; dos revisiones a la vez nunca apartan de más", async () => {
		const elPedido = await pedido();
		await meterPiezas(servidor, ubicacion.BOD ?? "", prenda.variantes["6"] ?? "", 3);
		expect(
			(
				await revision("surtir_de_bodega", elPedido.pedido_id, {
					producto_id: prenda.productoId,
					renglones: [{ variante_id: prenda.variantes["6"], piezas: 5 }],
				})
			).cuerpo,
		).toMatchObject({
			codigo: "bodega_sin_libres",
			mensaje: expect.stringMatching(/talla 6: quedan \d+\.$/),
		});
		const version = await versionDelPedido(servidor, elPedido.pedido_id);
		const surtir = () =>
			mandarAccion(
				servidor,
				"ventas.surtir_de_bodega",
				{ datos: { pedido_id: elPedido.pedido_id, producto_id: prenda.productoId }, version },
				"ventas",
			);
		const [uno, dos] = await Promise.all([surtir(), surtir()]);
		expect([uno.estado, dos.estado].sort()).toEqual([200, 409]);
	});
});
