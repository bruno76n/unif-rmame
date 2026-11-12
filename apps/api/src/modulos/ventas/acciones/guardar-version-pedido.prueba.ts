/**
 * Prueba de `ventas.guardar_version_pedido` y `ventas.cancelar_pedido`: una versión guarda el antes y el después sin
 * cambiar un renglón confirmado, respeta el mínimo de cada talla y avisa de las piezas de más; cancelar pasa sus lotes
 * a temporada, libera sus reservas y deja a favor su anticipo.
 * Fase 16 · docs/fases/16-ventas-a-externos.md («Criterios de terminado»)
 */

import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { saldoAFavorDePrueba, versionDelCredito } from "../../../nucleo/pruebas/contaduria-de-prueba.ts";
import { llamarInterna, meterPiezas, ubicacionesPorCodigo } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import type { PrendaDelTaller } from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import {
	darDeAltaClienteDePrueba,
	pedidoConfirmadoDePrueba,
	prendaParaVender,
	versionDelPedido,
	versionVigenteDePrueba,
} from "../../../nucleo/pruebas/ventas-de-prueba.ts";

describe("Una versión guarda el antes y el después, respeta el mínimo y avisa de las piezas de más; cancelar deja todo en su lugar", () => {
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

	/** Ventas guarda la versión siguiente con los renglones que deben quedar. */
	async function version(
		pedidoId: string,
		clienteId: string,
		renglones: unknown[],
		cambios: Record<string, unknown> = {},
	) {
		return mandarAccion(
			servidor,
			"ventas.guardar_version_pedido",
			{
				datos: {
					pedido_id: pedidoId,
					cliente_id: clienteId,
					fecha_entrega: entrega(),
					forma_pago: "contado",
					renglones,
					...cambios,
				},
				version: await versionDelPedido(servidor, pedidoId),
			},
			"ventas",
		);
	}

	/** Los renglones de un pedido: talla, piezas, desde y hasta qué versión, y su precio. */
	async function renglones(pedidoId: string) {
		const { rows } = await servidor.base.dueno.query(
			`SELECT t.nombre AS talla, r.cantidad, r.desde_version AS desde, r.hasta_version AS hasta,
				r.precio_unitario_centavos::int AS precio
			 FROM pedido_renglones r JOIN variantes v ON v.id = r.variante_id JOIN tallas t ON t.id = v.talla_id
			 WHERE r.pedido_id = $1 ORDER BY t.nombre, r.desde_version`,
			[pedidoId],
		);
		return rows;
	}

	it("versión 2: sube la talla 4, quita la 6 y agrega la 8; el renglón confirmado no cambia, se cierra; sin cambios no hay versión", async () => {
		const cliente = await darDeAltaClienteDePrueba(servidor);
		const pedido = await pedidoConfirmadoDePrueba(servidor, {
			cliente_id: cliente.cliente_id,
			fecha_entrega: entrega(),
			renglones: [
				{ variante_id: prenda.variantes["4"], cantidad: 10, precio_dado_centavos: 20_000 },
				{ variante_id: prenda.variantes["6"], cantidad: 5 },
			],
		});
		const v2 = await version(pedido.pedido_id, cliente.cliente_id, [
			{ variante_id: prenda.variantes["4"], cantidad: 12 },
			{ variante_id: prenda.variantes["8"], cantidad: 3 },
		]);
		expect(v2.cuerpo.resultado).toMatchObject({
			mensaje: `${pedido.folio} versión 2: faltan 15 piezas por mandar a producción`,
			numero: 2,
			por_mandar: 15,
			de_mas: 0,
		});
		expect(await renglones(pedido.pedido_id)).toEqual([
			{ talla: "4", cantidad: 10, desde: 1, hasta: 2, precio: 20_000 },
			{ talla: "4", cantidad: 12, desde: 2, hasta: null, precio: 20_000 },
			{ talla: "6", cantidad: 5, desde: 1, hasta: 2, precio: 25_000 },
			{ talla: "8", cantidad: 3, desde: 2, hasta: null, precio: 25_000 },
		]);
		const { rows } = await servidor.base.dueno.query(
			"SELECT p.version_vigente, (SELECT count(*)::int FROM pedido_versiones v WHERE v.pedido_id = p.id) AS versiones FROM pedidos p WHERE p.id = $1",
			[pedido.pedido_id],
		);
		expect(rows).toEqual([{ version_vigente: 2, versiones: 2 }]);
		expect(
			(
				await version(pedido.pedido_id, cliente.cliente_id, [
					{ variante_id: prenda.variantes["4"], cantidad: 12 },
					{ variante_id: prenda.variantes["8"], cantidad: 3 },
				])
			).cuerpo,
		).toMatchObject({ codigo: "sin_cambios" });
	});

	it("con 5 listas en aduana, la talla no baja de 5 ni se quita; con piezas en producción, bajarla avisa las de más", async () => {
		const cliente = await darDeAltaClienteDePrueba(servidor);
		const pedido = await pedidoConfirmadoDePrueba(servidor, {
			cliente_id: cliente.cliente_id,
			fecha_entrega: entrega(),
			renglones: [
				{ variante_id: prenda.variantes["4"], cantidad: 10 },
				{ variante_id: prenda.variantes["6"], cantidad: 8 },
			],
		});
		await servidor.base.dueno.query(
			`INSERT INTO reservas (id, ubicacion_id, variante_id, piezas, motivo, pedido_id, estado)
			 VALUES ($1, $2, $3, 5, 'pedido_externo', $4, 'activa')`,
			[uuidv7(), ubicacion.ADU, prenda.variantes["4"], pedido.pedido_id],
		);
		expect(
			(
				await version(pedido.pedido_id, cliente.cliente_id, [
					{ variante_id: prenda.variantes["4"], cantidad: 3 },
					{ variante_id: prenda.variantes["6"], cantidad: 8 },
				])
			).cuerpo,
		).toMatchObject({ codigo: "talla_bajo_minimo", mensaje: `${prenda.nombre} talla 4: mínimo 5.` });
		expect(
			(await version(pedido.pedido_id, cliente.cliente_id, [{ variante_id: prenda.variantes["6"], cantidad: 8 }]))
				.cuerpo,
		).toMatchObject({ codigo: "prenda_no_se_quita" });
		await llamarInterna(servidor, "produccion.mandar_a_produccion", {
			pedido_id: pedido.pedido_id,
			pedido_version_id: await versionVigenteDePrueba(servidor, pedido.pedido_id),
			fecha_entrega: entrega(),
			renglones: [{ variante_id: prenda.variantes["6"], piezas: 8 }],
		});
		const baja = await version(pedido.pedido_id, cliente.cliente_id, [
			{ variante_id: prenda.variantes["4"], cantidad: 10 },
			{ variante_id: prenda.variantes["6"], cantidad: 5 },
		]);
		expect(baja.cuerpo).toMatchObject({
			resultado: { de_mas: 3, mensaje: expect.stringMatching(/Producción ajusta sus lotes$/) },
			avisos: ["Sobran 3 piezas en producción: Producción ajusta sus lotes"],
		});
		// Nace el cambio de esa versión, por aplicar, para Producción.
		const { rows: cambios } = await servidor.base.dueno.query(
			`SELECT c.estado, v.numero FROM cambios_pedido c JOIN pedido_versiones v ON v.id = c.pedido_version_id
			 WHERE c.pedido_id = $1`,
			[pedido.pedido_id],
		);
		expect(cambios).toEqual([
			{ estado: "por_aplicar", numero: z.object({ numero: z.number() }).parse(baja.cuerpo.resultado).numero },
		]);
	});

	it("un cliente detenido no suma piezas en una versión; sí las baja", async () => {
		const cliente = await darDeAltaClienteDePrueba(servidor);
		const pedido = await pedidoConfirmadoDePrueba(servidor, {
			cliente_id: cliente.cliente_id,
			fecha_entrega: entrega(),
			renglones: [{ variante_id: prenda.variantes["4"], cantidad: 10 }],
		});
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
			(await version(pedido.pedido_id, cliente.cliente_id, [{ variante_id: prenda.variantes["4"], cantidad: 11 }]))
				.cuerpo,
		).toMatchObject({
			codigo: "cliente_detenido",
			mensaje: expect.stringMatching(/la versión no puede sumar piezas\.$/),
		});
		expect(
			(await version(pedido.pedido_id, cliente.cliente_id, [{ variante_id: prenda.variantes["4"], cantidad: 9 }]))
				.estado,
		).toBe(200);
	});

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
});
