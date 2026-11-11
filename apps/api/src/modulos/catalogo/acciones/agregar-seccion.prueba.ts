/**
 * Prueba de agregar una sección del catálogo: solo la dueña, sin repetirla, al final del orden; y la siembra
 * de las siete secciones y los cuatro grupos de tallas.
 * Fase 8 · docs/fases/08-catalogo.md (parte 1)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("solo la dueña agrega una sección, al final del orden; la siembra trae las secciones y los grupos de tallas", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("la siembra trae las siete secciones en su orden y los cuatro grupos con sus tallas", async () => {
		const secciones = await servidor.base.dueno.query("SELECT nombre, lleva_receta FROM secciones ORDER BY orden");
		expect(secciones.rows.map((seccion) => seccion.nombre)).toEqual([
			"Playeras",
			"Camisas y batas",
			"Suéteres y chalecos",
			"Pants y sudaderas",
			"Faldas, jumpers y mandiles",
			"Pantalones",
			"Accesorios y servicios",
		]);
		expect(secciones.rows.at(-1)).toEqual({ nombre: "Accesorios y servicios", lleva_receta: false });
		const { rows } = await servidor.base.dueno.query(
			`SELECT g.nombre, string_agg(t.nombre, ' ' ORDER BY t.orden) AS tallas
			 FROM grupos_talla g JOIN tallas t ON t.grupo_talla_id = g.id GROUP BY g.nombre, g.orden ORDER BY g.orden`,
		);
		expect(rows).toEqual([
			{ nombre: "Infantil", tallas: "3 4 6 8 10 12 14 16 18" },
			{ nombre: "Juvenil y adulto", tallas: "CH M G XG XXG" },
			{ nombre: "Pantalón por cintura", tallas: "26 28 30 32 34 36 38" },
			{ nombre: "Talla única", tallas: "Única" },
		]);
	});

	it("la dueña la agrega al final; repetida sin importar mayúsculas, seccion_repetida; otra cuenta, 403 solo_duena", async () => {
		const agregar = (nombre: string, quien = "duena") =>
			mandarAccion(servidor, "catalogo.agregar_seccion", { datos: { nombre, lleva_receta: false } }, quien);
		const agregada = await agregar("Uniformes deportivos");
		expect(agregada.cuerpo).toMatchObject({
			resultado: { mensaje: "Uniformes deportivos ya está en Catálogo. Sale en Productos y en el alta" },
		});
		const { rows } = await servidor.base.dueno.query(
			"SELECT nombre, orden, lleva_receta FROM secciones ORDER BY orden DESC LIMIT 1",
		);
		expect(rows[0]).toEqual({ nombre: "Uniformes deportivos", orden: 8, lleva_receta: false });
		expect((await agregar("PLAYERAS")).cuerpo).toMatchObject({
			codigo: "seccion_repetida",
			mensaje: "Ya está en la lista.",
		});
		const otra = await agregar("Gorras", "admin");
		expect(otra.estado).toBe(403);
		expect(otra.cuerpo).toMatchObject({ codigo: "solo_duena" });
	});
});
