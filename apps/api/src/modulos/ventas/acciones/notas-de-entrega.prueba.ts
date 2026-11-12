/**
 * Prueba de las notas de entrega: armarla con lo listo en aduana al precio del pedido y con su anticipo, nunca más de
 * lo listo; cancelarla antes de que salga regresa sus piezas y su anticipo; Aduana la despacha y pasa a en camino;
 * confirmar la entrega saca las piezas, crea su cuenta por cobrar y deja el pedido entregado; pasar a bodega baja las
 * piezas del pedido en una versión nueva.
 * Fase 16 · docs/fases/16-ventas-a-externos.md (parte 4)
 */

import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
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

describe("Una nota de entrega sale con lo listo del pedido, a su precio y con su anticipo; al entregarla, Contaduría la cobra", () => {
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
