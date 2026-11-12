/**
 * Prueba de `ventas.confirmar_entrega`: Aduana despacha la nota y pasa a en camino; al confirmar la entrega, las piezas
 * salen de Tránsito, nace su cuenta por cobrar y el pedido puede quedar entregado; a Aduana nunca le viajan importes.
 * Fase 16 · docs/fases/16-ventas-a-externos.md («Criterios de terminado»)
 */

import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { despacharDePrueba } from "../../../nucleo/pruebas/aduana-de-prueba.ts";
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

describe("Confirmar la entrega saca las piezas, crea la cuenta por cobrar y puede dejar entregado el pedido", () => {
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

	/** Ventas (o quien se diga) confirma la entrega de una nota. */
	async function confirmar(notaId: string, recibio: string, quien = "ventas") {
		return mandarAccion(
			servidor,
			"ventas.confirmar_entrega",
			{ datos: { nota_id: notaId, recibio_nombre: recibio }, version: await versionDeNota(notaId) },
			quien,
		);
	}

	/** Los traspasos de una nota. */
	async function traspasosDeLaNota(notaId: string): Promise<string[]> {
		const filas = await consultar("SELECT id FROM traspasos WHERE nota_entrega_id = $1 ORDER BY folio", [notaId]);
		return filas.map((fila) => String(fila.id));
	}

	it("despachar y entregar: la nota pasa a en camino; al confirmar, sale de Tránsito, nace su cuenta y el pedido queda entregado", async () => {
		const { cliente, pedido, variante, precio } = await pedidoConListo(5, 5, 20_000);
		const nota = armada(await armar(pedido.pedido_id, 5));
		// Sin despachar, no se confirma.
		expect((await confirmar(nota.nota_id, "Laura Méndez")).cuerpo).toMatchObject({
			codigo: "nota_no_en_camino",
			mensaje: `${nota.folio} no ha salido de aduana: primero se despacha.`,
		});
		const despacho = await despacharDePrueba(servidor, await traspasosDeLaNota(nota.nota_id));
		const [{ nombre } = { nombre: "" }] = await consultar(
			"SELECT t.nombre FROM clientes c JOIN terceros t ON t.id = c.tercero_id WHERE c.id = $1",
			[cliente.cliente_id],
		);
		expect(despacho.cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(
				new RegExp(`^${nota.folio} sale con D-\\d{4} a ${nombre}\\. Queda en camino hasta que firme de recibido$`),
			),
		});
		expect(await consultar("SELECT estado FROM notas_entrega WHERE id = $1", [nota.nota_id])).toEqual([
			{ estado: "en_camino" },
		]);
		// «Quién recibió» corto no entra; Aduana confirma y no recibe importes.
		expect((await confirmar(nota.nota_id, "Lu", "aduana")).cuerpo).toMatchObject({
			campos: { recibio_nombre: "Escribe quién recibió" },
		});
		const entregada = await confirmar(nota.nota_id, "Laura Méndez", "aduana");
		expect(entregada.cuerpo.resultado).toEqual({
			mensaje: `${nota.folio} entregada a ${nombre}. Contaduría ya la cobra`,
			nota_id: nota.nota_id,
			pedido_entregado: true,
			version: expect.any(Number),
		});
		expect(
			await consultar(
				"SELECT estado, recibio_nombre, fecha_entrega IS NOT NULL AS con_fecha FROM notas_entrega WHERE id = $1",
				[nota.nota_id],
			),
		).toEqual([{ estado: "entregada", recibio_nombre: "Laura Méndez", con_fecha: true }]);
		// Sale del inventario: nada queda en Tránsito; el despacho, recibido.
		expect(
			await consultar(
				`SELECT e.piezas FROM existencias e JOIN ubicaciones u ON u.id = e.ubicacion_id
				 WHERE e.variante_id = $1 AND u.codigo = 'TRA' AND e.piezas <> 0`,
				[variante],
			),
		).toEqual([]);
		expect(
			await consultar("SELECT estado, recibio_nombre FROM despachos WHERE nota_entrega_id = $1", [nota.nota_id]),
		).toEqual([{ estado: "recibido", recibio_nombre: "Laura Méndez" }]);
		// Su cuenta por cobrar: el subtotal menos el anticipo.
		expect(
			await consultar(
				"SELECT importe_centavos::int AS importe, total_nota_centavos::int AS total FROM cuentas_por_cobrar WHERE nota_entrega_id = $1",
				[nota.nota_id],
			),
		).toEqual([{ importe: 5 * precio - 20_000, total: 5 * precio }]);
		expect(await consultar("SELECT estado FROM pedidos WHERE id = $1", [pedido.pedido_id])).toEqual([
			{ estado: "entregado" },
		]);
		expect((await confirmar(nota.nota_id, "Laura Méndez")).cuerpo).toMatchObject({ codigo: "nota_ya_entregada" });
	});

	it("Ventas sí recibe lo que queda por cobrar al confirmar la entrega", async () => {
		const { pedido, precio } = await pedidoConListo(2, 2);
		const nota = armada(await armar(pedido.pedido_id, 2));
		await despacharDePrueba(servidor, await traspasosDeLaNota(nota.nota_id));
		const entregada = await confirmar(nota.nota_id, "Laura Méndez", "ventas");
		expect(entregada.cuerpo.resultado).toMatchObject({ por_cobrar_centavos: 2 * precio, pedido_entregado: true });
	});
});
