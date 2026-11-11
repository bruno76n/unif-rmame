/**
 * Prueba de dar de baja y reactivar una escuela: con su motivo, una sola vez, y sin perder sus datos.
 * Fase 8 · docs/fases/08-catalogo.md (partes 1 y 3: el candado de los modelos activos llega con los productos)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("una escuela se da de baja con motivo y se reactiva; sus datos se conservan", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** La versión de una escuela. */
	async function version(id: string): Promise<number> {
		return Number(
			(await servidor.base.dueno.query("SELECT version FROM escuelas WHERE id = $1", [id])).rows[0]?.version,
		);
	}

	it("baja con motivo; otra vez, ya_dada_de_baja; reactivarla limpia la baja; activa, escuela_activa", async () => {
		const alta = await mandarAccion(
			servidor,
			"catalogo.agregar_escuela",
			{ datos: { nombre: "Colegio Morelos", municipio: "Zamora" } },
			"catalogo",
		);
		const id = z.object({ escuela_id: z.uuid() }).parse(alta.cuerpo.resultado).escuela_id;
		const corto = await mandarAccion(
			servidor,
			"catalogo.dar_baja_escuela",
			{ datos: { escuela_id: id, motivo: "Ya" }, version: await version(id) },
			"catalogo",
		);
		expect(corto.cuerpo).toMatchObject({ campos: { motivo: "Escribe al menos 5 letras." } });
		const dada = await mandarAccion(
			servidor,
			"catalogo.dar_baja_escuela",
			{ datos: { escuela_id: id, motivo: "Cerró la escuela" }, version: await version(id) },
			"catalogo",
		);
		expect(dada.cuerpo).toMatchObject({
			resultado: { mensaje: "Colegio Morelos dada de baja. Sus modelos y su historial se conservan" },
		});
		expect(
			(
				await mandarAccion(
					servidor,
					"catalogo.dar_baja_escuela",
					{ datos: { escuela_id: id, motivo: "Otra vez" }, version: await version(id) },
					"catalogo",
				)
			).cuerpo,
		).toMatchObject({ codigo: "ya_dada_de_baja", mensaje: "Colegio Morelos ya está dada de baja." });
		const reactivar = async () =>
			mandarAccion(
				servidor,
				"catalogo.reactivar_escuela",
				{ datos: { escuela_id: id }, version: await version(id) },
				"catalogo",
			);
		expect((await reactivar()).cuerpo).toMatchObject({
			resultado: { mensaje: "Colegio Morelos vuelve a estar activa" },
		});
		const { rows } = await servidor.base.dueno.query(
			"SELECT baja_en, motivo_baja, reactivado_en IS NOT NULL AS reactivada FROM escuelas WHERE id = $1",
			[id],
		);
		expect(rows[0]).toEqual({ baja_en: null, motivo_baja: null, reactivada: true });
		expect((await reactivar()).cuerpo).toMatchObject({ codigo: "escuela_activa" });
		const bitacora = await servidor.base.dueno.query(
			"SELECT descripcion, antes FROM bitacora WHERE accion = 'catalogo.reactivar_escuela' AND entidad_id = $1",
			[id],
		);
		expect(bitacora.rows).toEqual([
			{ descripcion: "Colegio Morelos vuelve a estar activa", antes: { activa: false, motivo: "Cerró la escuela" } },
		]);
	});
});
