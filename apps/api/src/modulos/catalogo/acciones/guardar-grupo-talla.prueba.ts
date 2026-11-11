/**
 * Prueba de guardar un grupo de tallas: nuevo, sin repetir el grupo ni una talla, y con tallas que se
 * renombran, se reordenan, se quitan y vuelven.
 * Fase 8 · docs/fases/08-catalogo.md (partes 1 y 3: una talla en uso llega con los productos)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que regresa guardar un grupo. */
const guardado = z.object({ grupo_talla_id: z.uuid(), version: z.number().int() });

describe("un grupo de tallas se guarda completo: sus tallas nuevas, sus nombres, su orden y las que se quitan", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Guarda un grupo como Catálogo. */
	function guardar(datos: Record<string, unknown>) {
		return mandarAccion(servidor, "catalogo.guardar_grupo_talla", { datos }, "catalogo");
	}

	/** Las tallas de un grupo: las vigentes en orden y las quitadas. */
	async function tallasDe(grupoId: string) {
		const { rows } = await servidor.base.dueno.query(
			"SELECT id, nombre, orden, baja_en IS NOT NULL AS quitada FROM tallas WHERE grupo_talla_id = $1 ORDER BY quitada, orden",
			[grupoId],
		);
		return rows;
	}

	it("un grupo nuevo con sus tallas; el mismo nombre, grupo_repetido; dos tallas iguales, talla_repetida", async () => {
		const nuevo = await guardar({
			nombre: "Calzado",
			tallas: [
				{ nombre: "22", orden: 1 },
				{ nombre: "23", orden: 2 },
			],
		});
		expect(nuevo.cuerpo).toMatchObject({ resultado: { mensaje: "Grupo Calzado guardado" } });
		const { grupo_talla_id } = guardado.parse(nuevo.cuerpo.resultado);
		expect((await tallasDe(grupo_talla_id)).map((talla) => talla.nombre)).toEqual(["22", "23"]);
		expect((await guardar({ nombre: "calzado", tallas: [{ nombre: "24", orden: 1 }] })).cuerpo).toMatchObject({
			codigo: "grupo_repetido",
		});
		expect(
			(
				await guardar({
					nombre: "Bebés",
					tallas: [
						{ nombre: "0-3", orden: 1 },
						{ nombre: "0-3", orden: 2 },
					],
				})
			).cuerpo,
		).toMatchObject({ codigo: "talla_repetida", mensaje: "La talla 0-3 ya está en el grupo." });
	});

	it("renombra y reordena con la versión; la que no viene queda con baja y vuelve con su nombre; versión vieja, 409", async () => {
		const nuevo = guardado.parse(
			(
				await guardar({
					nombre: "Cinturones",
					tallas: [
						{ nombre: "70", orden: 1 },
						{ nombre: "80", orden: 2 },
						{ nombre: "90", orden: 3 },
					],
				})
			).cuerpo.resultado,
		);
		const [setenta, ochenta, noventa] = await tallasDe(nuevo.grupo_talla_id);
		const cambiado = await guardar({
			grupo_talla_id: nuevo.grupo_talla_id,
			nombre: "Cinturones",
			version: nuevo.version,
			tallas: [
				{ talla_id: noventa.id, nombre: "90", orden: 1 },
				{ talla_id: setenta.id, nombre: "75", orden: 2 },
			],
		});
		expect(cambiado.estado).toBe(200);
		expect(await tallasDe(nuevo.grupo_talla_id)).toEqual([
			{ id: noventa.id, nombre: "90", orden: 1, quitada: false },
			{ id: setenta.id, nombre: "75", orden: 2, quitada: false },
			{ id: ochenta.id, nombre: "80", orden: 2, quitada: true },
		]);
		const vieja = await guardar({
			grupo_talla_id: nuevo.grupo_talla_id,
			nombre: "Cinturones",
			version: nuevo.version,
			tallas: [{ talla_id: noventa.id, nombre: "90", orden: 1 }],
		});
		expect(vieja.cuerpo).toMatchObject({ error: "conflicto_version" });
		const actual = guardado.parse(cambiado.cuerpo.resultado).version;
		await guardar({
			grupo_talla_id: nuevo.grupo_talla_id,
			nombre: "Cinturones",
			version: actual,
			tallas: [
				{ talla_id: noventa.id, nombre: "90", orden: 1 },
				{ talla_id: setenta.id, nombre: "75", orden: 2 },
				{ nombre: "80", orden: 3 },
			],
		});
		// La que vuelve con el nombre de una quitada es la misma, reactivada.
		expect((await tallasDe(nuevo.grupo_talla_id)).find((talla) => talla.nombre === "80")).toEqual({
			id: ochenta.id,
			nombre: "80",
			orden: 3,
			quitada: false,
		});
	});
});
