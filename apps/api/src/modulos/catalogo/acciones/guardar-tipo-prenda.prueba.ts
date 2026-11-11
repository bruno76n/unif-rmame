/**
 * Prueba de guardar un tipo de prenda: de una sección con receta, sin repetirse, con sus medidas en el rango
 * y una medida que ya no viene, con baja.
 * Fase 8 · docs/fases/08-catalogo.md (parte 1)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que regresa guardar un tipo. */
const guardado = z.object({ tipo_prenda_id: z.uuid(), version: z.number().int() });

describe("las medidas de un tipo de prenda respetan su rango; el tipo es de una sección con receta y no se repite", () => {
	let servidor: ServidorDePrueba;
	let playeras: string;
	let accesorios: string;
	let tallas: Record<string, string>;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		const { rows } = await servidor.base.dueno.query("SELECT id, nombre FROM secciones");
		playeras = rows.find((seccion) => seccion.nombre === "Playeras")?.id;
		accesorios = rows.find((seccion) => seccion.nombre === "Accesorios y servicios")?.id;
		const deInfantil = await servidor.base.dueno.query(
			"SELECT t.id, t.nombre FROM tallas t JOIN grupos_talla g ON g.id = t.grupo_talla_id WHERE g.nombre = 'Infantil'",
		);
		tallas = Object.fromEntries(deInfantil.rows.map((talla) => [talla.nombre, talla.id]));
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Guarda un tipo como Catálogo. */
	function guardar(datos: Record<string, unknown>) {
		return mandarAccion(servidor, "catalogo.guardar_tipo_prenda", { datos }, "catalogo");
	}

	/** Las medidas de un tipo: las vigentes y las quitadas. */
	async function medidasDe(tipoId: string) {
		const { rows } = await servidor.base.dueno.query(
			"SELECT medida, valor_cm::float AS valor, baja_en IS NOT NULL AS quitada FROM tipo_prenda_medidas WHERE tipo_prenda_id = $1 ORDER BY quitada, orden, valor_cm",
			[tipoId],
		);
		return rows;
	}

	it("un tipo nuevo con sus medidas; fuera del rango, 400; repetida, medida_repetida; sección sin receta, seccion_sin_receta", async () => {
		const largo = {
			medida: "Largo",
			orden: 1,
			valores: [
				{ talla_id: tallas["4"], valor_cm: 42 },
				{ talla_id: tallas["6"], valor_cm: null },
			],
		};
		const nuevo = await guardar({ nombre: "Playera polo", seccion_id: playeras, medidas: [largo] });
		expect(nuevo.cuerpo).toMatchObject({ resultado: { mensaje: "Tipo de prenda Playera polo guardado" } });
		const { tipo_prenda_id } = guardado.parse(nuevo.cuerpo.resultado);
		expect(await medidasDe(tipo_prenda_id)).toEqual([
			{ medida: "Largo", valor: 42, quitada: false },
			{ medida: "Largo", valor: null, quitada: false },
		]);
		const fuera = await guardar({
			nombre: "Playera cuello V",
			seccion_id: playeras,
			medidas: [{ medida: "Pecho", orden: 1, valores: [{ talla_id: tallas["8"], valor_cm: 420 }] }],
		});
		expect(fuera.estado).toBe(400);
		expect(fuera.cuerpo).toMatchObject({
			campos: { medidas: "Pecho, talla 8: 420 cm no parece medida de la prenda. Va en centímetros" },
		});
		expect(
			(
				await guardar({
					nombre: "Playera cuello V",
					seccion_id: playeras,
					medidas: [largo, { ...largo, medida: "LARGO" }],
				})
			).cuerpo,
		).toMatchObject({ codigo: "medida_repetida", mensaje: "LARGO ya está en las medidas" });
		expect((await guardar({ nombre: "Moño", seccion_id: accesorios, medidas: [] })).cuerpo).toMatchObject({
			codigo: "seccion_sin_receta",
			mensaje: "Accesorios y servicios no lleva receta: sus productos no tienen medidas.",
		});
		expect((await guardar({ nombre: "PLAYERA POLO", seccion_id: playeras, medidas: [] })).cuerpo).toMatchObject({
			codigo: "tipo_repetido",
		});
	});

	it("cambiarlo con su versión: una medida que ya no viene queda con baja y un valor nuevo se guarda; versión vieja, 409", async () => {
		const nuevo = guardado.parse(
			(
				await guardar({
					nombre: "Pantalón escolar",
					seccion_id: playeras,
					medidas: [
						{ medida: "Cintura", orden: 1, valores: [{ talla_id: tallas["10"], valor_cm: 30 }] },
						{ medida: "Largo", orden: 2, valores: [{ talla_id: tallas["10"], valor_cm: 70 }] },
					],
				})
			).cuerpo.resultado,
		);
		const cambiado = await guardar({
			tipo_prenda_id: nuevo.tipo_prenda_id,
			nombre: "Pantalón escolar",
			seccion_id: playeras,
			version: nuevo.version,
			medidas: [{ medida: "Cintura", orden: 1, valores: [{ talla_id: tallas["10"], valor_cm: 31.5 }] }],
		});
		expect(cambiado.estado).toBe(200);
		expect(await medidasDe(nuevo.tipo_prenda_id)).toEqual([
			{ medida: "Cintura", valor: 31.5, quitada: false },
			{ medida: "Largo", valor: 70, quitada: true },
		]);
		const vieja = await guardar({
			tipo_prenda_id: nuevo.tipo_prenda_id,
			nombre: "Pantalón escolar",
			seccion_id: playeras,
			version: nuevo.version,
			medidas: [],
		});
		expect(vieja.cuerpo).toMatchObject({ error: "conflicto_version" });
		const { rows } = await servidor.base.dueno.query(
			"SELECT descripcion FROM bitacora WHERE accion = 'catalogo.guardar_tipo_prenda' AND entidad_id = $1 ORDER BY ocurrido_en",
			[nuevo.tipo_prenda_id],
		);
		expect(rows.map((renglon) => renglon.descripcion)).toEqual([
			"Tipo de prenda Pantalón escolar: nuevo, medidas",
			"Tipo de prenda Pantalón escolar: medidas",
		]);
	});
});
