/**
 * Prueba de `ventas.pedir_nota_credito`: solo de una nota entregada, nunca de más de lo que queda ni con piezas de más,
 * y una a la vez; nace su AU- para Dirección.
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

describe("Pedir una nota de crédito sigue sus reglas y nace su autorización", () => {
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

	it("pedirla: solo de una entregada, nunca de más ni con piezas de más; una a la vez", async () => {
		const nota = await notaEntregada(4);
		expect((await pedir(nota.notaId, nota.subtotal + 100)).cuerpo).toMatchObject({
			codigo: "monto_de_mas",
			mensaje: expect.stringMatching(
				new RegExp(`^La nota de crédito no puede pasar de \\$[\\d,.]+: es lo que queda de ${nota.folio}\\.$`),
			),
		});
		expect(
			(await pedir(nota.notaId, 1_000, [{ nota_entrega_linea_id: nota.lineaId, cantidad: 5 }])).cuerpo,
		).toMatchObject({
			codigo: "piezas_de_mas",
			mensaje: `${prenda.nombre} talla 4: solo pueden regresar 4.`,
		});
		const pedida = await pedir(nota.notaId, 1_000);
		expect(pedida.cuerpo.resultado).toMatchObject({
			mensaje: `Nota de crédito para ${nota.folio} enviada a Dirección`,
		});
		expect((await pedir(nota.notaId, 1_000)).cuerpo).toMatchObject({
			codigo: "nota_credito_esperando",
			mensaje: `${nota.folio} ya tiene una nota de crédito esperando autorización.`,
		});
		const { rows } = await servidor.base.dueno.query(
			"SELECT a.tipo, a.estado, a.importe_centavos::int AS importe FROM autorizaciones a WHERE a.nota_entrega_id = $1",
			[nota.notaId],
		);
		expect(rows).toEqual([{ tipo: "nota_credito", estado: "por_autorizar", importe: 1_000 }]);
	});
});
