/**
 * Prueba de `ventas.guardar_borrador_pedido` y `ventas.confirmar_pedido`: confirmar congela el precio (dado, o el
 * sugerido de hoy, más el recargo) y nace la versión 1; un cliente detenido no confirma.
 * Fase 16 · docs/fases/16-ventas-a-externos.md («Criterios de terminado»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { versionDelCredito } from "../../../nucleo/pruebas/contaduria-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import type { PrendaDelTaller } from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import {
	darDeAltaClienteDePrueba,
	pedidoConfirmadoDePrueba,
	pedidoDeVentas,
	prendaParaVender,
	versionDelPedido,
} from "../../../nucleo/pruebas/ventas-de-prueba.ts";

describe("Confirmar congela el precio y nace la versión 1; un cliente detenido no confirma", () => {
	let servidor: ServidorDePrueba;
	let prenda: PrendaDelTaller;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		prenda = await prendaParaVender(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Los renglones de un pedido, con sus precios. */
	async function renglones(pedidoId: string) {
		const { rows } = await servidor.base.dueno.query(
			`SELECT t.nombre AS talla, r.cantidad, r.precio_sugerido_centavos::int AS sugerido, r.origen_sugerido AS origen,
				r.precio_dado_centavos::int AS dado, r.precio_unitario_centavos::int AS unitario, r.congelado_en IS NOT NULL AS congelado,
				r.desde_version AS desde, r.hasta_version AS hasta
			 FROM pedido_renglones r JOIN variantes v ON v.id = r.variante_id JOIN tallas t ON t.id = v.talla_id
			 WHERE r.pedido_id = $1 ORDER BY t.nombre, r.desde_version`,
			[pedidoId],
		);
		return rows;
	}

	it("guarda el borrador con el precio de hoy, lo edita en su lugar y lo confirma: precio congelado y versión 1", async () => {
		const cliente = await darDeAltaClienteDePrueba(servidor);
		const borrador = await pedidoDeVentas(servidor, "guardar_borrador_pedido", {
			cliente_id: cliente.cliente_id,
			renglones: [
				{ variante_id: prenda.variantes["4"], cantidad: 10 },
				{ variante_id: prenda.variantes["6"], cantidad: 5, precio_dado_centavos: 20_000 },
			],
		});
		const { pedido_id: id, folio } = z
			.object({ pedido_id: z.uuid(), folio: z.string() })
			.parse(borrador.cuerpo.resultado);
		expect(borrador.cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(/^PE-\d{4} guardado como borrador para /),
			total_centavos: 10 * 25_000 + 5 * 20_000,
		});
		// Lo edita en su lugar: quita la talla 6, agrega la 8 y no deja otro renglón de bitácora.
		const editado = await pedidoDeVentas(
			servidor,
			"guardar_borrador_pedido",
			{
				pedido_id: id,
				cliente_id: cliente.cliente_id,
				renglones: [
					{ variante_id: prenda.variantes["4"], cantidad: 12 },
					{ variante_id: prenda.variantes["8"], cantidad: 3 },
				],
			},
			await versionDelPedido(servidor, id),
		);
		expect(editado.cuerpo.resultado).toMatchObject({ mensaje: `${folio} actualizado` });
		const confirmado = await mandarAccion(
			servidor,
			"ventas.confirmar_pedido",
			{ datos: { pedido_id: id }, version: await versionDelPedido(servidor, id) },
			"ventas",
		);
		expect(confirmado.cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(new RegExp(`^${folio} confirmado para .+\\. El precio quedó congelado\\.$`)),
			por_mandar: 15,
		});
		expect(await renglones(id)).toEqual([
			{
				talla: "4",
				cantidad: 12,
				sugerido: 25_000,
				origen: "mostrador",
				dado: null,
				unitario: 25_000,
				congelado: true,
				desde: 1,
				hasta: null,
			},
			{
				talla: "6",
				cantidad: 5,
				sugerido: 25_000,
				origen: "mostrador",
				dado: 20_000,
				unitario: 20_000,
				congelado: false,
				desde: 1,
				hasta: 1,
			},
			{
				talla: "8",
				cantidad: 3,
				sugerido: 25_000,
				origen: "mostrador",
				dado: null,
				unitario: 25_000,
				congelado: true,
				desde: 1,
				hasta: null,
			},
		]);
		const { rows } = await servidor.base.dueno.query(
			`SELECT p.estado, p.confirmado_en IS NOT NULL AS confirmado, v.numero, v.origen,
				(SELECT count(*)::int FROM bitacora b WHERE b.entidad_id = p.id) AS bitacora
			 FROM pedidos p JOIN pedido_versiones v ON v.pedido_id = p.id WHERE p.id = $1`,
			[id],
		);
		expect(rows).toEqual([{ estado: "confirmado", confirmado: true, numero: 1, origen: "confirmacion", bitacora: 2 }]);
		expect(
			(
				await mandarAccion(
					servidor,
					"ventas.confirmar_pedido",
					{ datos: { pedido_id: id }, version: await versionDelPedido(servidor, id) },
					"ventas",
				)
			).cuerpo,
		).toMatchObject({ codigo: "pedido_no_es_borrador", mensaje: `${folio} ya está confirmado.` });
	});

	it("un cliente detenido no levanta pedidos nuevos ni confirma; su borrador sí se guarda", async () => {
		const cliente = await darDeAltaClienteDePrueba(servidor);
		const renglones = [{ variante_id: prenda.variantes["4"], cantidad: 4 }];
		const borrador = z
			.object({ pedido_id: z.uuid() })
			.parse(
				(await pedidoDeVentas(servidor, "guardar_borrador_pedido", { cliente_id: cliente.cliente_id, renglones }))
					.cuerpo.resultado,
			);
		await mandarAccion(
			servidor,
			"contaduria.cambiar_semaforo_credito",
			{
				datos: { cliente_id: cliente.cliente_id, semaforo: "detenido" },
				version: await versionDelCredito(servidor, cliente.cliente_id),
			},
			"contaduria",
		);
		expect(
			(await pedidoDeVentas(servidor, "guardar_borrador_pedido", { cliente_id: cliente.cliente_id, renglones })).cuerpo,
		).toMatchObject({
			codigo: "cliente_detenido",
			mensaje: expect.stringMatching(/está detenido por crédito: no se le pueden levantar pedidos nuevos\.$/),
		});
		expect(
			(
				await pedidoDeVentas(
					servidor,
					"guardar_borrador_pedido",
					{
						pedido_id: borrador.pedido_id,
						cliente_id: cliente.cliente_id,
						renglones: [{ variante_id: prenda.variantes["4"], cantidad: 6 }],
					},
					await versionDelPedido(servidor, borrador.pedido_id),
				)
			).estado,
		).toBe(200);
		expect(
			(
				await mandarAccion(
					servidor,
					"ventas.confirmar_pedido",
					{ datos: { pedido_id: borrador.pedido_id }, version: await versionDelPedido(servidor, borrador.pedido_id) },
					"ventas",
				)
			).cuerpo,
		).toMatchObject({
			codigo: "cliente_detenido",
			mensaje: expect.stringMatching(/el pedido no se confirma hasta que Contaduría lo libere\.$/),
		});
	});

	it("lo que impide: entrega pasada, crédito sin límite, una prenda que no se vende a externos, piezas en 0 y un cliente de baja", async () => {
		const cliente = await darDeAltaClienteDePrueba(servidor);
		const base = { cliente_id: cliente.cliente_id, renglones: [{ variante_id: prenda.variantes["4"], cantidad: 2 }] };
		expect(
			(await pedidoDeVentas(servidor, "confirmar_pedido", { ...base, fecha_entrega: "2020-01-01" })).cuerpo,
		).toMatchObject({
			codigo: "entrega_pasada",
		});
		expect(
			(await pedidoDeVentas(servidor, "confirmar_pedido", { ...base, forma_pago: "credito" })).cuerpo,
		).toMatchObject({
			codigo: "sin_credito",
		});
		const deMostrador = await prendaParaVender(servidor, { canales: ["mostrador"] });
		expect(
			(
				await pedidoDeVentas(servidor, "confirmar_pedido", {
					...base,
					renglones: [{ variante_id: deMostrador.variantes["4"], cantidad: 1 }],
				})
			).cuerpo,
		).toMatchObject({ codigo: "no_se_vende_a_externos" });
		expect(
			(
				await pedidoDeVentas(servidor, "confirmar_pedido", {
					...base,
					renglones: [{ variante_id: prenda.variantes["4"], cantidad: 0 }],
				})
			).cuerpo,
		).toMatchObject({ campos: { renglones: "Agrega al menos una prenda con piezas." } });
		const otro = await pedidoConfirmadoDePrueba(servidor, base);
		expect(otro.folio).toMatch(/^PE-\d{4}$/);
		const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM clientes WHERE id = $1", [
			cliente.cliente_id,
		]);
		await mandarAccion(
			servidor,
			"ventas.cancelar_pedido",
			{
				datos: { pedido_id: otro.pedido_id, motivo: "Se equivocó de cliente" },
				version: await versionDelPedido(servidor, otro.pedido_id),
			},
			"ventas",
		);
		await mandarAccion(
			servidor,
			"ventas.dar_baja_cliente",
			{ datos: { cliente_id: cliente.cliente_id, motivo: "Cerró" }, version: rows[0]?.v },
			"ventas",
		);
		expect((await pedidoDeVentas(servidor, "confirmar_pedido", base)).cuerpo).toMatchObject({
			codigo: "cliente_dado_de_baja",
		});
	});

	it("un pago y saldo a favor entran al pedido como anticipo hasta lo que le falta; a un borrador no; su talla no se da de baja", async () => {
		const cliente = await darDeAltaClienteDePrueba(servidor);
		const renglones = [{ variante_id: prenda.variantes["8"], cantidad: 10 }];
		const pedido = await pedidoConfirmadoDePrueba(servidor, {
			cliente_id: cliente.cliente_id,
			forma_pago: "anticipo",
			renglones,
		});
		const pagar = (pedidoId: string, monto: number) =>
			mandarAccion(
				servidor,
				"contaduria.registrar_pago_recibido",
				{ datos: { cliente_id: cliente.cliente_id, pedido_id: pedidoId, monto_centavos: monto, medio: "efectivo" } },
				"contaduria",
			);
		expect((await pagar(pedido.pedido_id, 200_000)).cuerpo.resultado).toMatchObject({
			mensaje: expect.stringMatching(/^PG-\d{4}: \$2,000 de /),
		});
		expect((await pagar(pedido.pedido_id, 60_000)).cuerpo).toMatchObject({
			codigo: "monto_mayor_que_saldo",
			mensaje: `El saldo de ${pedido.folio} es $500.`,
		});
		const { rows } = await servidor.base.dueno.query(
			"SELECT tipo, monto_centavos::int AS monto, pago_id IS NOT NULL AS con_pago FROM anticipos WHERE pedido_id = $1",
			[pedido.pedido_id],
		);
		expect(rows).toEqual([{ tipo: "recibido", monto: 200_000, con_pago: true }]);
		const borrador = z
			.object({ pedido_id: z.uuid() })
			.parse(
				(await pedidoDeVentas(servidor, "guardar_borrador_pedido", { cliente_id: cliente.cliente_id, renglones }))
					.cuerpo.resultado,
			);
		expect((await pagar(borrador.pedido_id, 10_000)).cuerpo).toMatchObject({
			codigo: "pedido_no_abierto",
			mensaje: expect.stringMatching(/^PE-\d{4} no está confirmado y abierto: no se le puede registrar anticipo\.$/),
		});
		const { rows: producto } = await servidor.base.dueno.query(
			"SELECT version::int AS v FROM productos WHERE id = $1",
			[prenda.productoId],
		);
		expect(
			(
				await mandarAccion(
					servidor,
					"catalogo.dar_baja_talla",
					{ datos: { variante_id: prenda.variantes["8"], motivo: "Ya no se vende la 8" }, version: producto[0]?.v },
					"catalogo",
				)
			).cuerpo,
		).toMatchObject({ codigo: "talla_con_pedidos", mensaje: expect.stringContaining(pedido.folio) });
	});
});
