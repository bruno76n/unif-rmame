/**
 * Prueba de `produccion.agregar_operacion_flujo` y `produccion.quitar_operacion_flujo`: el corte siempre va primero y
 * no se quita; un flujo no queda con menos de dos; las siguientes recorren su orden; cada cambio toma la versión.
 * Fase 12 · docs/fases/12-produccion.md (parte 1)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { nuevaPersona } from "../../../nucleo/pruebas/personas-de-prueba.ts";
import { flujoDePrueba } from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("El corte siempre va primero y no se quita; un flujo no queda con menos de dos; las siguientes recorren su orden", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** La versión de un flujo. */
	async function version(flujoId: string): Promise<number> {
		const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM flujos WHERE id = $1", [flujoId]);
		return Number(rows[0]?.v);
	}

	/** Las operaciones vigentes de un flujo, con su orden. */
	async function lista(flujoId: string) {
		const { rows } = await servidor.base.dueno.query(
			`SELECT o.nombre, f.orden FROM flujo_operaciones f JOIN operaciones o ON o.id = f.operacion_id
			 WHERE f.flujo_id = $1 AND f.baja_en IS NULL ORDER BY f.orden`,
			[flujoId],
		);
		return rows.map((fila) => `${fila.orden}. ${fila.nombre}`);
	}

	/** Agrega una operación. */
	async function agregar(flujoId: string, datos: Record<string, unknown>, conVersion?: number) {
		return mandarAccion(
			servidor,
			"produccion.agregar_operacion_flujo",
			{ datos: { flujo_id: flujoId, ...datos }, version: conVersion ?? (await version(flujoId)) },
			"produccion",
		);
	}

	/** Quita una operación. */
	async function quitar(flujoId: string, flujoOperacionId: string | undefined) {
		return mandarAccion(
			servidor,
			"produccion.quitar_operacion_flujo",
			{ datos: { flujo_operacion_id: flujoOperacionId }, version: await version(flujoId) },
			"produccion",
		);
	}

	it("agregar entra antes de la que se escoge y las siguientes recorren uno; nace sin tarifa; la versión sube", async () => {
		const flujo = await flujoDePrueba(servidor.base.dueno, 2);
		const [, primera, segunda] = flujo.operaciones;
		const antes = await version(flujo.flujoId);
		const respuesta = await agregar(flujo.flujoId, {
			operacion: "Pegar forro",
			persona_base_id: flujo.personaId,
			va_antes_de_id: segunda?.flujoOperacionId,
		});
		expect(respuesta.cuerpo.resultado).toMatchObject({
			mensaje: `Pegar forro agregada a ${flujo.nombre}. La tarifa la pone Personal`,
		});
		expect(await lista(flujo.flujoId)).toEqual([
			"1. Corte",
			`2. ${primera?.nombre}`,
			"3. Pegar forro",
			`4. ${segunda?.nombre}`,
		]);
		expect(await version(flujo.flujoId)).toBeGreaterThan(antes);
		const { flujo_operacion_id } = z.object({ flujo_operacion_id: z.uuid() }).parse(respuesta.cuerpo.resultado);
		const { rows } = await servidor.base.dueno.query("SELECT id FROM tarifas_operacion WHERE flujo_operacion_id = $1", [
			flujo_operacion_id,
		]);
		expect(rows).toEqual([]);
		// Con otras mayúsculas es la misma operación del catálogo, y ya está en el flujo.
		expect(
			(
				await agregar(flujo.flujoId, {
					operacion: "PEGAR FORRO",
					persona_base_id: flujo.personaId,
					va_antes_de_id: segunda?.flujoOperacionId,
				})
			).cuerpo,
		).toMatchObject({ codigo: "operacion_ya_en_flujo", mensaje: "Ya está en este flujo." });
		// Con la versión de antes, 409.
		expect(
			(
				await agregar(
					flujo.flujoId,
					{ operacion: "Ojal", persona_base_id: flujo.personaId, va_antes_de_id: segunda?.flujoOperacionId },
					antes,
				)
			).estado,
		).toBe(409);
	});

	it("nada va antes del corte, y quien la hace es una persona activa del Taller", async () => {
		const flujo = await flujoDePrueba(servidor.base.dueno, 1);
		const [corte] = flujo.operaciones;
		expect(
			(
				await agregar(flujo.flujoId, {
					operacion: "Ojal",
					persona_base_id: flujo.personaId,
					va_antes_de_id: corte?.flujoOperacionId,
				})
			).cuerpo,
		).toMatchObject({ codigo: "corte_va_primero", mensaje: "El corte siempre va primero" });
		const deLaOficina = await nuevaPersona(servidor.base.dueno);
		expect(
			(
				await agregar(flujo.flujoId, {
					operacion: "Ojal",
					persona_base_id: deLaOficina,
					va_antes_de_id: flujo.operaciones[1]?.flujoOperacionId,
				})
			).cuerpo,
		).toMatchObject({ codigo: "persona_no_valida" });
	});

	it("quitar la da de baja y las siguientes bajan uno; el corte no se quita y no queda con menos de dos", async () => {
		const flujo = await flujoDePrueba(servidor.base.dueno, 3);
		const [corte, primera, segunda, tercera] = flujo.operaciones;
		expect((await quitar(flujo.flujoId, segunda?.flujoOperacionId)).cuerpo.resultado).toMatchObject({
			mensaje: `${segunda?.nombre} quitada de ${flujo.nombre}`,
		});
		expect(await lista(flujo.flujoId)).toEqual(["1. Corte", `2. ${primera?.nombre}`, `3. ${tercera?.nombre}`]);
		const { rows } = await servidor.base.dueno.query(
			"SELECT motivo_baja, baja_en IS NOT NULL AS de_baja FROM flujo_operaciones WHERE id = $1",
			[segunda?.flujoOperacionId],
		);
		expect(rows).toEqual([{ motivo_baja: "Quitada del flujo", de_baja: true }]);
		expect((await quitar(flujo.flujoId, corte?.flujoOperacionId)).cuerpo).toMatchObject({
			codigo: "corte_va_primero",
		});
		expect((await quitar(flujo.flujoId, tercera?.flujoOperacionId)).estado).toBe(200);
		expect((await quitar(flujo.flujoId, primera?.flujoOperacionId)).cuerpo).toMatchObject({
			codigo: "flujo_minimo",
			mensaje: "Un flujo lleva al menos el corte y una operación",
		});
	});

	it("dos cambios a la vez sobre el mismo flujo: uno entra y el otro responde 409", async () => {
		const flujo = await flujoDePrueba(servidor.base.dueno, 2);
		const antes = await version(flujo.flujoId);
		const [uno, otro] = await Promise.all(
			["Ojal", "Botón"].map((operacion) =>
				agregar(
					flujo.flujoId,
					{ operacion, persona_base_id: flujo.personaId, va_antes_de_id: flujo.operaciones[2]?.flujoOperacionId },
					antes,
				),
			),
		);
		expect([uno?.estado, otro?.estado].sort()).toEqual([200, 409]);
		expect(await lista(flujo.flujoId)).toHaveLength(4);
	});
});
