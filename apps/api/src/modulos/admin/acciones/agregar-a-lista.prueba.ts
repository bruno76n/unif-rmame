/**
 * Prueba de `admin.agregar_a_lista`.
 * Fase 4 · docs/fases/04-servicios-comunes.md (parte 2)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("un valor repetido en una lista (sin mayúsculas ni acentos) responde ya_esta", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Agrega a una lista como Administración del sistema. */
	function agregar(datos: Record<string, unknown>, quien = "admin") {
		return mandarAccion(servidor, "admin.agregar_a_lista", { datos }, quien);
	}

	it("agrega al final, y el mismo nombre con otras mayúsculas o acentos responde 422 ya_esta", async () => {
		const primera = await agregar({ lista: "prueba_categorias", nombre: "Papelería" });
		expect(primera.estado).toBe(200);
		expect(primera.cuerpo.resultado).toMatchObject({ mensaje: "«Papelería» agregada a Categorías de prueba" });
		expect((await agregar({ lista: "prueba_categorias", nombre: "Limpieza" })).estado).toBe(200);
		const repetida = await agregar({ lista: "prueba_categorias", nombre: "PAPELERIA" });
		expect(repetida.estado).toBe(422);
		expect(repetida.cuerpo).toMatchObject({ error: "regla", codigo: "ya_esta", mensaje: "Ya está en la lista." });
		const { rows } = await servidor.base.dueno.query(
			"SELECT v.nombre, v.orden FROM lista_valores v JOIN listas l ON l.id = v.lista_id WHERE l.clave = 'prueba_categorias' ORDER BY v.orden",
		);
		expect(rows).toEqual([
			{ nombre: "Papelería", orden: 1 },
			{ nombre: "Limpieza", orden: 2 },
		]);
	});

	it("el nombre va de 3 a 40; en las unidades de material de 1 a 20, con se_cuenta_entera y su clave", async () => {
		expect((await agregar({ lista: "prueba_categorias", nombre: "ab" })).cuerpo).toMatchObject({
			error: "validacion",
			campos: { nombre: "Escribe de 3 a 40 letras." },
		});
		expect((await agregar({ lista: "prueba_categorias", nombre: " " })).cuerpo).toMatchObject({
			campos: { nombre: "Escribe el nombre." },
		});
		expect((await agregar({ lista: "unidades_material", nombre: "m" }, "duena")).cuerpo).toMatchObject({
			campos: { se_cuenta_entera: "Escoge si se cuenta entera." },
		});
		expect(
			(await agregar({ lista: "unidades_material", nombre: "Métro", se_cuenta_entera: false }, "duena")).estado,
		).toBe(200);
		const { rows } = await servidor.base.dueno.query(
			"SELECT v.clave, v.se_cuenta_entera FROM lista_valores v JOIN listas l ON l.id = v.lista_id WHERE l.clave = 'unidades_material' AND v.nombre = 'Métro'",
		);
		expect(rows).toEqual([{ clave: "metro", se_cuenta_entera: false }]);
	});

	it("una lista de la dueña no la agrega nadie más; una que no existe responde 404", async () => {
		expect((await agregar({ lista: "prueba_solo_duena", nombre: "Otra cosa" })).cuerpo).toMatchObject({
			error: "sin_permiso",
			codigo: "solo_duena",
			mensaje: "Solo la dueña puede agregar",
		});
		expect((await agregar({ lista: "prueba_solo_duena", nombre: "Otra cosa" }, "duena")).estado).toBe(200);
		expect((await agregar({ lista: "no_existe", nombre: "Algo" })).estado).toBe(404);
	});
});
