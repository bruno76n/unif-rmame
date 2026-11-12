/**
 * Prueba de `inventario.apartar_para_nota`: crear una nota aparta lo listo y nunca más.
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
import { notaDePrueba, pedidoDePrueba } from "../../../nucleo/pruebas/ventas-de-prueba.ts";

describe("Crear una nota aparta lo listo y nunca más", () => {
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

	it("la nota se lleva 6 de 10: un hijo `nota_entrega` con su reserva; nunca más de lo listo; sin nada listo, `nada_listo`", async () => {
		const { variante, pedido, lote } = await pedidoListoEnAduana(servidor, 10);
		const { notaId: nota } = await notaDePrueba(servidor, { pedidoId: pedido });
		const hecha = (await llamarInterna(servidor, "inventario.apartar_para_nota", {
			nota_entrega_id: nota,
			pedido_id: pedido,
			renglones: [{ variante_id: variante, piezas: 6 }],
		})) as { traspaso_ids: string[] };
		expect(hecha.traspaso_ids).toHaveLength(1);
		expect(await reservasActivasDelPedido(servidor, pedido)).toEqual([
			{ motivo: "nota_entrega", piezas: 6, folio: `${lote.folio}-1`, tipo: "nota_entrega" },
			{ motivo: "pedido_externo", piezas: 4, folio: lote.folio, tipo: "lote_cliente" },
		]);
		const { rows } = await servidor.base.dueno.query(
			"SELECT nota_entrega_id, destino_externo FROM traspasos WHERE id = $1",
			[hecha.traspaso_ids[0]],
		);
		expect(rows).toEqual([{ nota_entrega_id: nota, destino_externo: "cliente_externo" }]);
		// Más de lo que queda listo.
		expect(
			await intentar("inventario.apartar_para_nota", {
				nota_entrega_id: (await notaDePrueba(servidor, { pedidoId: pedido })).notaId,
				pedido_id: pedido,
				renglones: [{ variante_id: variante, piezas: 5 }],
			}),
		).toMatchObject({ codigo: "sin_listo", mensaje: expect.stringMatching(/^Solo hay 4 listas de .+ talla .+$/) });
		// Un pedido sin nada en aduana.
		expect(
			await intentar("inventario.apartar_para_nota", {
				nota_entrega_id: (await notaDePrueba(servidor)).notaId,
				pedido_id: await pedidoDePrueba(servidor),
				renglones: [{ variante_id: variante, piezas: 1 }],
			}),
		).toMatchObject({ codigo: "nada_listo", mensaje: "Nada listo en aduana para este pedido" });
	});

	it("`inventario.listo_en_aduana` y `inventario.libres` cuentan lo apartado del pedido en cada lugar", async () => {
		const { variante, pedido } = await pedidoListoEnAduana(servidor, 7);
		const leer = (nombre: string, datos: unknown) =>
			enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) => contexto.lectura(nombre, datos));
		expect(await leer("inventario.listo_en_aduana", { pedido_id: pedido })).toEqual({
			variantes: [{ variante_id: variante, listas: 7, de_bodega: 0, en_camino: 0 }],
		});
		const { rows } = await servidor.base.dueno.query("SELECT id FROM ubicaciones WHERE codigo = 'ADU'");
		// En Aduana hay 7 y las 7 están apartadas.
		expect(await leer("inventario.libres", { ubicacion_id: rows[0]?.id, variante_id: variante })).toEqual({
			libres: 0,
		});
	});
});
