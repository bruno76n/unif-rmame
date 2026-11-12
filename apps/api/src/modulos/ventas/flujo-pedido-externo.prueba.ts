/**
 * Prueba del flujo completo de un pedido externo, con las acciones de cada departamento: alta del cliente, pedido con
 * anticipo, versión, surtir de bodega, mandar a producción, cortar, coser y revisar el lote, recibirlo del taller, la
 * nota, el despacho, la entrega, el pago y una nota de crédito con devolución.
 * Fase 16 · docs/fases/16-ventas-a-externos.md («Cómo se construye»: el flujo del pedido externo se prueba completo)
 */

import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { decidirDePrueba, despacharDePrueba, versionDeTraspaso } from "../../nucleo/pruebas/aduana-de-prueba.ts";
import { registrarEnBulto } from "../../nucleo/pruebas/calidad-de-prueba.ts";
import { siembraDelCatalogo } from "../../nucleo/pruebas/catalogo-de-prueba.ts";
import { saldoAFavorDePrueba } from "../../nucleo/pruebas/contaduria-de-prueba.ts";
import { meterPiezas, ubicacionesPorCodigo } from "../../nucleo/pruebas/inventario-de-prueba.ts";
import { mandarAccion } from "../../nucleo/pruebas/llamadas.ts";
import { cortarLoteDePrueba, prendaParaCortar } from "../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../nucleo/pruebas/servidor-de-prueba.ts";
import {
	darDeAltaClienteDePrueba,
	pedidoConfirmadoDePrueba,
	versionDelPedido,
} from "../../nucleo/pruebas/ventas-de-prueba.ts";

describe("Un pedido externo va de principio a fin", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[]) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	/** La versión de una fila de una tabla. */
	async function version(tabla: "notas_entrega" | "lotes", id: string): Promise<number> {
		const [fila] = await consultar(`SELECT version::int AS v FROM ${tabla} WHERE id = $1`, [id]);
		return z.number().parse(fila?.v);
	}

	/** Manda una acción y revisa que entre; regresa su resultado. */
	async function hacer(accion: string, cuerpo: { datos: unknown; version?: number }, quien: string) {
		const respuesta = await mandarAccion(servidor, accion, cuerpo, quien);
		if (respuesta.estado !== 200) throw new Error(`${accion}: ${JSON.stringify(respuesta.cuerpo)}`);
		return z.record(z.string(), z.unknown()).parse(respuesta.cuerpo.resultado);
	}

	/** El saldo de la cuenta por cobrar de una nota. */
	async function saldoDe(notaId: string): Promise<number> {
		const [fila] = await consultar(
			"SELECT saldo_centavos::int AS s FROM cuentas_por_cobrar WHERE nota_entrega_id = $1",
			[notaId],
		);
		return z.number().parse(fila?.s);
	}

	it("alta, pedido, versión, surtir, mandar, taller, nota, despacho, entrega, pago y nota de crédito con devolución", async () => {
		const ubicacion = await ubicacionesPorCodigo(servidor);
		const prenda = await prendaParaCortar(servidor, await siembraDelCatalogo(servidor));
		await consultar("UPDATE productos SET canal_externos = true WHERE id = $1", [prenda.productoId]);
		const [talla4, talla6] = [prenda.variantes["4"] ?? "", prenda.variantes["6"] ?? ""];
		// Ventas da de alta al cliente y le confirma un pedido con anticipo; Contaduría recibe el anticipo.
		const cliente = await darDeAltaClienteDePrueba(servidor);
		const pedido = await pedidoConfirmadoDePrueba(servidor, {
			cliente_id: cliente.cliente_id,
			fecha_entrega: Temporal.Now.plainDateISO("America/Mexico_City").add({ days: 30 }).toString(),
			forma_pago: "anticipo",
			renglones: [
				{ variante_id: talla4, cantidad: 10 },
				{ variante_id: talla6, cantidad: 5 },
			],
		});
		await hacer(
			"contaduria.registrar_pago_recibido",
			{
				datos: {
					cliente_id: cliente.cliente_id,
					pedido_id: pedido.pedido_id,
					monto_centavos: 50_000,
					medio: "efectivo",
				},
			},
			"contaduria",
		);
		// Una versión sube la talla 6 a 6.
		await hacer(
			"ventas.guardar_version_pedido",
			{
				datos: {
					pedido_id: pedido.pedido_id,
					cliente_id: cliente.cliente_id,
					fecha_entrega: Temporal.Now.plainDateISO("America/Mexico_City").add({ days: 30 }).toString(),
					forma_pago: "anticipo",
					renglones: [
						{ variante_id: talla4, cantidad: 10 },
						{ variante_id: talla6, cantidad: 6 },
					],
				},
				version: await versionDelPedido(servidor, pedido.pedido_id),
			},
			"ventas",
		);
		// Hay 3 de la talla 6 libres en Bodega: Ventas las aparta, Bodega las surte y Aduana las recibe.
		await meterPiezas(servidor, ubicacion.BOD ?? "", talla6, 3);
		await hacer(
			"ventas.surtir_de_bodega",
			{
				datos: { pedido_id: pedido.pedido_id, producto_id: prenda.productoId },
				version: await versionDelPedido(servidor, pedido.pedido_id),
			},
			"ventas",
		);
		const surtido = await hacer(
			"inventario.surtir_a_aduana",
			{ datos: { documento_tipo: "pedido_externo", documento_id: pedido.pedido_id } },
			"bodega",
		);
		const surtidoId = z.uuid().parse(surtido.traspaso_id);
		await hacer(
			"inventario.recibir_en_aduana",
			{ datos: { traspaso_id: surtidoId, modo: "completo" }, version: await versionDeTraspaso(servidor, surtidoId) },
			"aduana",
		);
		// Lo que falta va a producción: 10 de la 4 y 3 de la 6, en un lote del pedido.
		const mandado = await hacer(
			"ventas.mandar_a_produccion",
			{ datos: { pedido_id: pedido.pedido_id }, version: await versionDelPedido(servidor, pedido.pedido_id) },
			"ventas",
		);
		const [lote] = z.array(z.object({ lote_id: z.uuid(), folio: z.string(), piezas: z.number() })).parse(mandado.lotes);
		expect(lote?.piezas).toBe(13);
		// Producción lo corta, el taller lo cose y Calidad lo revisa sin rechazos.
		const cortado = await cortarLoteDePrueba(
			servidor,
			prenda,
			{ loteId: lote?.lote_id ?? "", folio: lote?.folio ?? "" },
			[
				{ variante_id: talla4, piezas: 10 },
				{ variante_id: talla6, piezas: 3 },
			],
		);
		for (const [i, bulto] of cortado.bultos.entries()) {
			await registrarEnBulto(servidor, cortado, i, 1, bulto.piezas);
			await registrarEnBulto(servidor, cortado, i, 2, bulto.piezas);
		}
		await hacer(
			"calidad.revisar_lote",
			{ datos: { lote_id: cortado.loteId, rechazos: [] }, version: await version("lotes", cortado.loteId) },
			"calidad",
		);
		// Aduana lo recibe del taller: todo va al cliente, apartado para el pedido.
		const recibido = await hacer(
			"inventario.recibir_del_taller",
			{
				datos: {
					lote_id: cortado.loteId,
					tallas: [
						{ variante_id: talla4, piezas: 10 },
						{ variante_id: talla6, piezas: 3 },
					],
				},
			},
			"aduana",
		);
		expect(recibido.mensaje).toBe(`${cortado.folio} en aduana: 13 piezas para ${pedido.folio}`);
		// Ventas arma la nota con todo lo listo: 16 piezas, con el anticipo descontado.
		const nota = await hacer(
			"ventas.armar_nota_entrega",
			{
				datos: {
					pedido_id: pedido.pedido_id,
					renglones: [
						{ variante_id: talla4, cantidad: 10 },
						{ variante_id: talla6, cantidad: 6 },
					],
				},
				version: await versionDelPedido(servidor, pedido.pedido_id),
			},
			"ventas",
		);
		const notaId = z.uuid().parse(nota.nota_id);
		expect(nota.anticipo_centavos).toBe(Math.min(50_000, Number(nota.subtotal_centavos)));
		// Aduana la despacha y confirma la entrega.
		const traspasos = await consultar("SELECT id FROM traspasos WHERE nota_entrega_id = $1", [notaId]);
		const despacho = await despacharDePrueba(
			servidor,
			traspasos.map((fila) => String(fila.id)),
		);
		expect(despacho.estado).toBe(200);
		const entrega = await hacer(
			"ventas.confirmar_entrega",
			{ datos: { nota_id: notaId, recibio_nombre: "Laura Méndez" }, version: await version("notas_entrega", notaId) },
			"aduana",
		);
		expect(entrega).toMatchObject({ pedido_entregado: true });
		expect(entrega).not.toHaveProperty("por_cobrar_centavos");
		// Contaduría cobra lo que queda.
		const porCobrar = await saldoDe(notaId);
		expect(porCobrar).toBe(Number(nota.subtotal_centavos) - Number(nota.anticipo_centavos));
		await hacer(
			"contaduria.registrar_pago_recibido",
			{
				datos: {
					cliente_id: cliente.cliente_id,
					nota_entrega_id: notaId,
					monto_centavos: porCobrar,
					medio: "efectivo",
				},
			},
			"contaduria",
		);
		expect(await saldoDe(notaId)).toBe(0);
		// Regresa 1 pieza de la talla 4: nota de crédito que Dirección autoriza; como ya estaba pagada, queda a favor.
		const [linea] = await consultar(
			"SELECT id, precio_unitario_centavos::int AS precio FROM nota_entrega_lineas WHERE nota_entrega_id = $1 AND variante_id = $2",
			[notaId, talla4],
		);
		const nc = await hacer(
			"ventas.pedir_nota_credito",
			{
				datos: {
					nota_id: notaId,
					que_paso: "Una pieza llegó con la costura abierta",
					monto_centavos: Number(linea?.precio),
					piezas: [{ nota_entrega_linea_id: linea?.id, cantidad: 1 }],
				},
			},
			"ventas",
		);
		const [autorizacion] = await consultar("SELECT autorizacion_id FROM notas_credito WHERE id = $1", [
			nc.nota_credito_id,
		]);
		expect(
			(await decidirDePrueba(servidor, String(autorizacion?.autorizacion_id), { decision: "autorizar" })).estado,
		).toBe(200);
		expect(await saldoAFavorDePrueba(servidor, cliente.cliente_id)).toBe(Number(linea?.precio));
		// La pieza regresa buena a Bodega.
		const [devolucion] = await consultar(
			"SELECT t.id, l.id AS linea FROM traspasos t JOIN traspaso_lineas l ON l.traspaso_id = t.id WHERE t.nota_credito_id = $1",
			[nc.nota_credito_id],
		);
		await hacer(
			"inventario.recibir_en_aduana",
			{
				datos: {
					traspaso_id: devolucion?.id,
					modo: "con_diferencias",
					renglones: [{ traspaso_linea_id: devolucion?.linea, piezas: 1 }],
				},
				version: await versionDeTraspaso(servidor, String(devolucion?.id)),
			},
			"aduana",
		);
		expect(
			await consultar(
				`SELECT d.codigo FROM traspasos t JOIN ubicaciones d ON d.id = t.destino_ubicacion_id WHERE t.traspaso_padre_id = $1`,
				[devolucion?.id],
			),
		).toEqual([{ codigo: "BOD" }]);
		expect(await consultar("SELECT estado FROM pedidos WHERE id = $1", [pedido.pedido_id])).toEqual([
			{ estado: "entregado" },
		]);
	});
});
