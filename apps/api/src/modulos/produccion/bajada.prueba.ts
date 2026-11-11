/**
 * Prueba de lo que baja de Producción a la tablet: las operaciones, los flujos y sus operaciones vigentes, nunca una
 * tarifa; la operación que se quita del flujo baja como `quitar`.
 * Fase 12 · docs/fases/12-produccion.md (parte 1)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bajarHastaTener, fotoCompleta } from "../../nucleo/pruebas/bajada-de-prueba.ts";
import { mandarAccion } from "../../nucleo/pruebas/llamadas.ts";
import { flujoDePrueba } from "../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../nucleo/pruebas/servidor-de-prueba.ts";

describe("A la tablet bajan los flujos con sus operaciones, nunca una tarifa", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("el flujo, sus operaciones y el catálogo bajan con lo suyo; la quitada baja como quitar", async () => {
		const flujo = await flujoDePrueba(servidor.base.dueno, 2);
		const [corte, primera, segunda] = flujo.operaciones;
		const { cambios, cursor } = await fotoCompleta(servidor);
		expect(cambios.find((cambio) => cambio.id === flujo.flujoId)).toEqual({
			tabla: "flujos",
			op: "cambio",
			id: flujo.flujoId,
			datos: { nombre: flujo.nombre },
		});
		expect(cambios.find((cambio) => cambio.id === primera?.flujoOperacionId)).toEqual({
			tabla: "flujo_operaciones",
			op: "cambio",
			id: primera?.flujoOperacionId,
			datos: {
				flujo_id: flujo.flujoId,
				operacion_id: primera?.operacionId,
				orden: 2,
				persona_base_id: flujo.personaId,
			},
		});
		expect(cambios.find((cambio) => cambio.id === corte?.operacionId)).toEqual({
			tabla: "operaciones",
			op: "cambio",
			id: corte?.operacionId,
			datos: { nombre: "Corte", es_corte: true },
		});
		expect(JSON.stringify(cambios)).not.toContain("tarifa");
		const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM flujos WHERE id = $1", [
			flujo.flujoId,
		]);
		await mandarAccion(
			servidor,
			"produccion.quitar_operacion_flujo",
			{ datos: { flujo_operacion_id: primera?.flujoOperacionId }, version: rows[0]?.v },
			"produccion",
		);
		const despues = await bajarHastaTener(servidor, cursor, [
			primera?.flujoOperacionId ?? "",
			segunda?.flujoOperacionId ?? "",
		]);
		expect(despues.cambios.filter((cambio) => cambio.id === primera?.flujoOperacionId).at(-1)).toEqual({
			tabla: "flujo_operaciones",
			op: "quitar",
			id: primera?.flujoOperacionId,
			datos: null,
		});
		expect(despues.cambios.filter((cambio) => cambio.id === segunda?.flujoOperacionId).at(-1)).toMatchObject({
			op: "cambio",
			datos: { orden: 2 },
		});
	});
});
