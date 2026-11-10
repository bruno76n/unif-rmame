/**
 * Prueba de que una acción es una sola transacción.
 * Fase 3 · docs/fases/03-api-protocolo-e-idempotencia.md (parte 2)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { contar, mandarAccion, nuevaClave } from "../pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../pruebas/servidor-de-prueba.ts";

describe("una acción que falla en cualquier paso no deja nada: ni sus escrituras, ni su clave, ni lo que hicieron sus internas", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});
	beforeEach(() => {
		servidor.fallas.bitacora = false;
	});

	/** Lo que hay en las tablas que tocan la acción y su interna, y en las claves. */
	async function loQueHay() {
		return {
			notas: await contar(servidor, "prueba_notas"),
			conteos: await contar(servidor, "prueba_conteos"),
			claves: await contar(servidor, "comandos_recibidos"),
		};
	}

	it("una acción que sale bien escribe la nota, lo de su interna y su clave, y pide bitácora y eventos una sola vez", async () => {
		const antes = await loQueHay();
		const pedidosAntes = { bitacora: servidor.pedidos.bitacora.length, eventos: servidor.pedidos.eventos.length };
		expect(
			(await mandarAccion(servidor, "prueba.crear_nota", { datos: { texto: "bien", monto_centavos: 1 } })).estado,
		).toBe(200);
		expect(await loQueHay()).toEqual({ notas: antes.notas + 1, conteos: antes.conteos + 1, claves: antes.claves + 1 });
		expect(servidor.pedidos.bitacora.length).toBe(pedidosAntes.bitacora + 1);
		expect(servidor.pedidos.eventos.length).toBe(pedidosAntes.eventos + 1);
		expect(servidor.pedidos.bitacora.at(-1)).toHaveLength(1);
		expect(servidor.pedidos.eventos.at(-1)).toEqual([
			expect.objectContaining({ tipo: "nota.creada", datos: expect.any(Object), tablas: ["prueba_notas"] }),
		]);
	});

	it.each([
		["con un error de regla antes de escribir", { fallar: "con_regla" }, 422],
		["con un error después de que corrió su interna", { fallar: "despues_de_la_interna" }, 500],
	])("%s, no queda nada", async (_caso, falla, estado) => {
		const antes = await loQueHay();
		const clave = nuevaClave();
		expect(
			(
				await mandarAccion(servidor, "prueba.crear_nota", {
					clave,
					datos: { texto: "mal", monto_centavos: 1, ...falla },
				})
			).estado,
		).toBe(estado);
		expect(await loQueHay()).toEqual(antes);
	});

	it("si falla la bitácora, tampoco queda nada", async () => {
		const antes = await loQueHay();
		servidor.fallas.bitacora = true;
		expect(
			(await mandarAccion(servidor, "prueba.crear_nota", { datos: { texto: "sin bitácora", monto_centavos: 1 } }))
				.estado,
		).toBe(500);
		expect(await loQueHay()).toEqual(antes);
	});
});
