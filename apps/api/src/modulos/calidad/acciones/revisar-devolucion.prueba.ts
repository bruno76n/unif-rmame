/**
 * Prueba de `calidad.revisar_devolucion`: lo que regresa con una nota de crédito y llega con defecto espera a Calidad
 * (no sale de aduana), que decide qué sirve y pasa a Bodega y qué es merma y sale; nunca más de lo pendiente.
 * Fase 16 · docs/fases/16-ventas-a-externos.md («Criterios de terminado»)
 */

import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { decidirDePrueba, despacharDePrueba, versionDeTraspaso } from "../../../nucleo/pruebas/aduana-de-prueba.ts";
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

describe("Calidad decide qué sirve y qué es merma de lo que regresa con defecto", () => {
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

	it("autorizada: toma su NC-, baja el saldo y Aduana espera las piezas; lo de defecto espera a Calidad, que decide", async () => {
		const nota = await notaEntregada(4);
		const saldo = await saldoDe(nota.notaId);
		const pedida = await pedir(nota.notaId, 30_000, [{ nota_entrega_linea_id: nota.lineaId, cantidad: 3 }]);
		const { nota_credito_id: ncId } = z.object({ nota_credito_id: z.uuid() }).parse(pedida.cuerpo.resultado);
		const decidida = await decidirDePrueba(servidor, await autorizacionDe(ncId), { decision: "autorizar" });
		expect(decidida.estado).toBe(200);
		expect(await consultar("SELECT estado, folio FROM notas_credito WHERE id = $1", [ncId])).toEqual([
			{ estado: "autorizada", folio: expect.stringMatching(/^NC-\d{4}$/) },
		]);
		expect(await saldoDe(nota.notaId)).toBe(Math.max(0, saldo - 30_000));
		// Aduana espera las 3: un A- `esperado`, de cliente externo y sin destino.
		const [esperada] = await consultar(
			`SELECT t.id, t.folio, t.estado, t.origen_externo, t.destino_ubicacion_id, l.id AS linea, l.piezas_enviadas AS piezas
			 FROM traspasos t JOIN traspaso_lineas l ON l.traspaso_id = t.id WHERE t.nota_credito_id = $1`,
			[ncId],
		);
		expect(esperada).toMatchObject({
			estado: "esperado",
			origen_externo: "cliente_externo",
			destino_ubicacion_id: null,
			piezas: 3,
		});
		const devolucion = String(esperada?.id);
		// Llegan las 3 con defecto: se quedan en aduana para Calidad y no salen.
		const recibida = await mandarAccion(
			servidor,
			"inventario.recibir_en_aduana",
			{
				datos: {
					traspaso_id: devolucion,
					modo: "con_diferencias",
					renglones: [{ traspaso_linea_id: esperada?.linea, piezas: 3, con_defecto: true }],
				},
				version: await versionDeTraspaso(servidor, devolucion),
			},
			"aduana",
		);
		expect(recibida.cuerpo.resultado).toMatchObject({ mensaje: `${esperada?.folio} recibida: pasa a Calidad` });
		expect((await despacharDePrueba(servidor, [devolucion], undefined)).cuerpo).toMatchObject({
			codigo: "espera_calidad",
		});
		// Calidad: 2 sirven y 1 es merma.
		const revisar = async (renglones: unknown[]) =>
			mandarAccion(
				servidor,
				"calidad.revisar_devolucion",
				{ datos: { traspaso_id: devolucion, renglones }, version: await version("traspasos", devolucion) },
				"calidad",
			);
		expect(
			(await revisar([{ traspaso_linea_id: esperada?.linea, piezas: 1, decision: "merma" }])).cuerpo,
		).toMatchObject({ campos: { motivo: "Escribe con qué tiene." } });
		expect(
			(await revisar([{ traspaso_linea_id: esperada?.linea, piezas: 4, decision: "sirve" }])).cuerpo,
		).toMatchObject({
			codigo: "piezas_mas_que_pendientes",
			mensaje: "En ese renglón quedan 3 piezas por revisar.",
		});
		const revisada = await revisar([
			{ traspaso_linea_id: esperada?.linea, piezas: 2, decision: "sirve" },
			{ traspaso_linea_id: esperada?.linea, piezas: 1, decision: "merma", motivo: "Tela rota" },
		]);
		expect(revisada.cuerpo.resultado).toMatchObject({ mensaje: `${esperada?.folio}: 2 a bodega, 1 como merma` });
		expect(
			await consultar(
				`SELECT t.estado, coalesce(d.codigo, t.destino_externo) AS destino, l.piezas_recibidas_aduana AS piezas
				 FROM traspasos t JOIN traspaso_lineas l ON l.traspaso_id = t.id LEFT JOIN ubicaciones d ON d.id = t.destino_ubicacion_id
				 WHERE t.traspaso_padre_id = $1 ORDER BY t.folio`,
				[devolucion],
			),
		).toEqual([
			{ estado: "en_aduana", destino: "BOD", piezas: 2 },
			{ estado: "salio", destino: "merma", piezas: 1 },
		]);
		// La merma sale de Aduana en el libro, con su hijo.
		expect(
			await consultar(
				`SELECT o.codigo AS origen, l.destino_ubicacion_id IS NULL AS a_fuera, l.piezas FROM movimientos m
				 JOIN movimiento_lineas l ON l.movimiento_id = m.id JOIN ubicaciones o ON o.id = l.origen_ubicacion_id
				 JOIN traspasos t ON t.id = l.traspaso_id
				 WHERE m.tipo = 'merma_calidad' AND t.traspaso_padre_id = $1`,
				[devolucion],
			),
		).toEqual([{ origen: "ADU", a_fuera: true, piezas: 1 }]);
		expect(await consultar("SELECT estado FROM traspasos WHERE id = $1", [devolucion])).toEqual([
			{ estado: "repartido" },
		]);
		expect(
			await consultar(
				"SELECT decision, piezas, motivo, origen FROM revisiones_devolucion WHERE traspaso_id = $1 ORDER BY decision DESC",
				[devolucion],
			),
		).toEqual([
			{ decision: "sirve", piezas: 2, motivo: null, origen: "nota_credito" },
			{ decision: "merma", piezas: 1, motivo: "Tela rota", origen: "nota_credito" },
		]);
		// Ya no regresan más de lo entregado menos lo que ya regresó.
		expect(
			(await pedir(nota.notaId, 100, [{ nota_entrega_linea_id: nota.lineaId, cantidad: 2 }])).cuerpo,
		).toMatchObject({
			codigo: "piezas_de_mas",
			mensaje: `${prenda.nombre} talla 4: solo pueden regresar 1.`,
		});
	});
});
