/**
 * Prueba de `ventas.aplicar_decision_nota_credito`: autorizada toma su folio, baja el saldo (lo de más queda a favor) y
 * deja esperando sus piezas, y lo bueno que regresa pasa a Bodega; rechazada no cambia nada.
 * Fase 16 · docs/fases/16-ventas-a-externos.md («Criterios de terminado»)
 */

import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { decidirDePrueba, despacharDePrueba, versionDeTraspaso } from "../../../nucleo/pruebas/aduana-de-prueba.ts";
import { saldoAFavorDePrueba } from "../../../nucleo/pruebas/contaduria-de-prueba.ts";
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

describe("Una nota de crédito autorizada toma su folio, baja el saldo y deja esperando sus piezas", () => {
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

	/** La versión de una fila. */
	async function version(tabla: "notas_entrega" | "traspasos", id: string): Promise<number> {
		const [fila] = await consultar(`SELECT version::int AS v FROM ${tabla} WHERE id = $1`, [id]);
		return z.number().parse(fila?.v);
	}

	/** Una nota de tantas piezas de la talla 4, armada, despachada y entregada: su id, su folio, su renglón y su cuenta. */
	async function notaEntregada(piezas: number) {
		const cliente = await darDeAltaClienteDePrueba(servidor);
		const pedido = await pedidoConfirmadoDePrueba(servidor, {
			cliente_id: cliente.cliente_id,
			fecha_entrega: Temporal.Now.plainDateISO("America/Mexico_City").add({ days: 30 }).toString(),
			renglones: [{ variante_id: prenda.variantes["4"], cantidad: piezas }],
		});
		await listoEnAduanaDePrueba(servidor, pedido.pedido_id, prenda.variantes["4"] ?? "", piezas);
		const armada = await mandarAccion(
			servidor,
			"ventas.armar_nota_entrega",
			{
				datos: { pedido_id: pedido.pedido_id, renglones: [{ variante_id: prenda.variantes["4"], cantidad: piezas }] },
				version: await versionDelPedido(servidor, pedido.pedido_id),
			},
			"ventas",
		);
		const { nota_id: notaId, folio } = z
			.object({ nota_id: z.uuid(), folio: z.string() })
			.parse(armada.cuerpo.resultado);
		const traspasos = await consultar("SELECT id FROM traspasos WHERE nota_entrega_id = $1", [notaId]);
		await despacharDePrueba(
			servidor,
			traspasos.map((fila) => String(fila.id)),
		);
		const entregada = await mandarAccion(
			servidor,
			"ventas.confirmar_entrega",
			{ datos: { nota_id: notaId, recibio_nombre: "Laura Méndez" }, version: await version("notas_entrega", notaId) },
			"ventas",
		);
		expect(entregada.estado).toBe(200);
		const [linea] = await consultar(
			"SELECT id, precio_unitario_centavos::int AS precio FROM nota_entrega_lineas WHERE nota_entrega_id = $1",
			[notaId],
		);
		return {
			notaId,
			folio,
			lineaId: String(linea?.id),
			subtotal: piezas * z.number().parse(linea?.precio),
		};
	}

	/** Ventas pide una nota de crédito. */
	function pedir(notaId: string, monto: number, piezas?: { nota_entrega_linea_id: string; cantidad: number }[]) {
		return mandarAccion(
			servidor,
			"ventas.pedir_nota_credito",
			{
				datos: {
					nota_id: notaId,
					que_paso: "Regresan con la costura abierta",
					monto_centavos: monto,
					...(piezas === undefined ? {} : { piezas }),
				},
			},
			"ventas",
		);
	}

	/** La autorización de una nota de crédito. */
	async function autorizacionDe(notaCreditoId: string): Promise<string> {
		const [fila] = await consultar("SELECT autorizacion_id FROM notas_credito WHERE id = $1", [notaCreditoId]);
		return z.uuid().parse(fila?.autorizacion_id);
	}

	/** El saldo de la cuenta por cobrar de una nota. */
	async function saldoDe(notaId: string): Promise<number> {
		const [fila] = await consultar(
			"SELECT saldo_centavos::int AS s FROM cuentas_por_cobrar WHERE nota_entrega_id = $1",
			[notaId],
		);
		return z.number().parse(fila?.s);
	}

	it("autorizada: toma su NC-, baja el saldo y lo de más queda a favor; Aduana espera sus piezas sin destino", async () => {
		const nota = await notaEntregada(4);
		const [{ cliente_id: clienteId } = { cliente_id: "" }] = await consultar(
			"SELECT cliente_id FROM notas_entrega WHERE id = $1",
			[nota.notaId],
		);
		// Ya pagada toda: la nota de crédito no tiene saldo que bajar.
		const pago = await mandarAccion(
			servidor,
			"contaduria.registrar_pago_recibido",
			{
				datos: {
					cliente_id: clienteId,
					nota_entrega_id: nota.notaId,
					monto_centavos: await saldoDe(nota.notaId),
					medio: "efectivo",
				},
			},
			"contaduria",
		);
		expect(pago.estado).toBe(200);
		const pedida = await pedir(nota.notaId, 30_000, [{ nota_entrega_linea_id: nota.lineaId, cantidad: 2 }]);
		const { nota_credito_id: ncId } = z.object({ nota_credito_id: z.uuid() }).parse(pedida.cuerpo.resultado);
		const decidida = await decidirDePrueba(servidor, await autorizacionDe(ncId), { decision: "autorizar" });
		expect(decidida.estado).toBe(200);
		expect(await consultar("SELECT estado, folio FROM notas_credito WHERE id = $1", [ncId])).toEqual([
			{ estado: "autorizada", folio: expect.stringMatching(/^NC-\d{4}$/) },
		]);
		expect(await saldoDe(nota.notaId)).toBe(0);
		expect(await saldoAFavorDePrueba(servidor, String(clienteId))).toBe(30_000);
		expect(
			await consultar(
				`SELECT t.tipo, t.estado, t.origen_externo, t.destino_ubicacion_id, l.piezas_enviadas AS piezas
				 FROM traspasos t JOIN traspaso_lineas l ON l.traspaso_id = t.id WHERE t.nota_credito_id = $1`,
				[ncId],
			),
		).toEqual([
			{
				tipo: "devolucion_cliente_externo",
				estado: "esperado",
				origen_externo: "cliente_externo",
				destino_ubicacion_id: null,
				piezas: 2,
			},
		]);
	});

	it("lo que regresa bueno pasa a Bodega al recibirlo; una rechazada no cambia el saldo", async () => {
		const nota = await notaEntregada(2);
		const saldo = await saldoDe(nota.notaId);
		const rechazar = await pedir(nota.notaId, 5_000);
		const { nota_credito_id: rechazadaId } = z.object({ nota_credito_id: z.uuid() }).parse(rechazar.cuerpo.resultado);
		await decidirDePrueba(servidor, await autorizacionDe(rechazadaId), { decision: "rechazar", motivo: "No procede" });
		expect(await consultar("SELECT estado, folio FROM notas_credito WHERE id = $1", [rechazadaId])).toEqual([
			{ estado: "rechazada", folio: null },
		]);
		expect(await saldoDe(nota.notaId)).toBe(saldo);
		const pedida = await pedir(nota.notaId, 5_000, [{ nota_entrega_linea_id: nota.lineaId, cantidad: 2 }]);
		const { nota_credito_id: ncId } = z.object({ nota_credito_id: z.uuid() }).parse(pedida.cuerpo.resultado);
		await decidirDePrueba(servidor, await autorizacionDe(ncId), { decision: "autorizar" });
		const [esperada] = await consultar(
			"SELECT t.id, l.id AS linea FROM traspasos t JOIN traspaso_lineas l ON l.traspaso_id = t.id WHERE t.nota_credito_id = $1",
			[ncId],
		);
		const devolucion = String(esperada?.id);
		await mandarAccion(
			servidor,
			"inventario.recibir_en_aduana",
			{
				datos: {
					traspaso_id: devolucion,
					modo: "con_diferencias",
					renglones: [{ traspaso_linea_id: esperada?.linea, piezas: 2 }],
				},
				version: await versionDeTraspaso(servidor, devolucion),
			},
			"aduana",
		);
		expect(
			await consultar(
				`SELECT t.estado, d.codigo AS destino FROM traspasos t JOIN ubicaciones d ON d.id = t.destino_ubicacion_id
				 WHERE t.traspaso_padre_id = $1`,
				[devolucion],
			),
		).toEqual([{ estado: "en_aduana", destino: "BOD" }]);
		expect(await consultar("SELECT estado FROM traspasos WHERE id = $1", [devolucion])).toEqual([
			{ estado: "repartido" },
		]);
	});
});
