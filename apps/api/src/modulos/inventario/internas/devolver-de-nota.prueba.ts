/**
 * Prueba de `inventario.devolver_de_nota`: cancelar una nota antes de salir regresa sus piezas al pedido.
 * Fase 9 · docs/fases/09-inventario-libro-existencias-reservas-y-traspasos.md (parte 3)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { ErrorDeApi } from "../../../nucleo/http/errores.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import {
	llamarInterna,
	pedidoListoEnAduana,
	reservasActivasDelPedido,
} from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { notaDePrueba } from "../../../nucleo/pruebas/ventas-de-prueba.ts";
import { cambiarEstadoTraspaso } from "../dominio/traspasos.ts";

describe("Cancelar una nota antes de salir lo regresa al pedido", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Llama una interna y regresa su error de regla, si lo hay. */
	function intentar(nombre: string, datos: unknown) {
		return llamarInterna(servidor, nombre, datos).catch((error: unknown) =>
			error instanceof ErrorDeApi ? error.cuerpo() : Promise.reject(error),
		);
	}

	it("cancelar la nota antes de salir regresa sus piezas al pedido en un hijo `lote_cliente`; una que ya salió, `nota_ya_salio`", async () => {
		const { variante, pedido, lote } = await pedidoListoEnAduana(servidor, 10);
		const { notaId: nota } = await notaDePrueba(servidor, { pedidoId: pedido });
		await llamarInterna(servidor, "inventario.apartar_para_nota", {
			nota_entrega_id: nota,
			pedido_id: pedido,
			renglones: [{ variante_id: variante, piezas: 10 }],
		});
		const devuelta = (await llamarInterna(servidor, "inventario.devolver_de_nota", { nota_entrega_id: nota })) as {
			traspaso_ids: string[];
		};
		expect(devuelta.traspaso_ids).toHaveLength(1);
		expect(await reservasActivasDelPedido(servidor, pedido)).toEqual([
			{ motivo: "pedido_externo", piezas: 10, folio: `${lote.folio}-1-1`, tipo: "lote_cliente" },
		]);
		const { rows } = await servidor.base.dueno.query(
			"SELECT estado, motivo_fin FROM reservas WHERE nota_entrega_id = $1 ORDER BY creado_en",
			[nota],
		);
		expect(rows).toEqual([{ estado: "transferida", motivo_fin: "nota_cancelada" }]);
		// Otra nota, que ya salió con su despacho.
		const { notaId: otra } = await notaDePrueba(servidor, { pedidoId: pedido });
		const hecha = (await llamarInterna(servidor, "inventario.apartar_para_nota", {
			nota_entrega_id: otra,
			pedido_id: pedido,
			renglones: [{ variante_id: variante, piezas: 3 }],
		})) as { traspaso_ids: string[] };
		await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			cambiarEstadoTraspaso(contexto, hecha.traspaso_ids[0] ?? "", "en_transito"),
		);
		expect(await intentar("inventario.devolver_de_nota", { nota_entrega_id: otra, folio: "NV-0150" })).toMatchObject({
			codigo: "nota_ya_salio",
			mensaje: expect.stringMatching(/^NV-0150 ya salió con A-/),
		});
	});
});
