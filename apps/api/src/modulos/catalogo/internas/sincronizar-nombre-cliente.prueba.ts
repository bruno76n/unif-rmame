/**
 * Prueba de renombrar al cliente: renombra su lista (y su nombre corto si era igual) y, solo si se llamaba igual,
 * su escuela.
 * Fase 8 · docs/fases/08-catalogo.md (parte 2)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { renglonDeClienteDePrueba } from "../../../nucleo/pruebas/ventas-de-prueba.ts";

describe("renombrar al cliente renombra su lista y, solo si se llamaba igual, su escuela", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Llama una interna del catálogo como lo haría Ventas. */
	function interna(nombre: string, datos: Record<string, unknown>) {
		return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.interna(nombre, datos),
		);
	}

	/** Un cliente escuela con su escuela y su lista. */
	async function clienteEscuela(nombre: string, nombreDeLaEscuela = nombre) {
		const { clienteId: cliente } = await renglonDeClienteDePrueba(servidor);
		const { escuela_id } = z
			.object({ escuela_id: z.uuid() })
			.parse(await interna("catalogo.crear_escuela_para_cliente", { nombre: nombreDeLaEscuela, municipio: "Zamora" }));
		const { lista_id } = z
			.object({ lista_id: z.uuid() })
			.parse(await interna("catalogo.crear_lista_cliente", { cliente_id: cliente, nombre }));
		return { cliente, escuela_id, lista_id };
	}

	/** El nombre de una escuela y el de una lista. */
	async function nombres(escuelaId: string, listaId: string) {
		const { rows } = await servidor.base.dueno.query(
			"SELECT (SELECT nombre FROM escuelas WHERE id = $1) AS escuela, (SELECT nombre FROM listas_precios WHERE id = $2) AS lista, (SELECT nombre_corto FROM listas_precios WHERE id = $2) AS corto",
			[escuelaId, listaId],
		);
		return rows[0];
	}

	it("se llamaban igual: renombra la lista, su nombre corto y la escuela", async () => {
		const { cliente, escuela_id, lista_id } = await clienteEscuela("Colegio Juárez");
		const renombrado = await interna("catalogo.sincronizar_nombre_cliente", {
			cliente_id: cliente,
			nombre_anterior: "Colegio Juárez",
			nombre: "Colegio Benito Juárez",
			escuela_id,
		});
		expect(renombrado).toEqual({ lista: true, escuela: true });
		expect(await nombres(escuela_id, lista_id)).toEqual({
			escuela: "Colegio Benito Juárez",
			lista: "Colegio Benito Juárez",
			corto: "Colegio Benito Juárez",
		});
	});

	it("la escuela tenía otro nombre: solo renombra la lista", async () => {
		const { cliente, escuela_id, lista_id } = await clienteEscuela("Instituto Zamora AC", "Instituto Zamora");
		const renombrado = await interna("catalogo.sincronizar_nombre_cliente", {
			cliente_id: cliente,
			nombre_anterior: "Instituto Zamora AC",
			nombre: "Instituto Zamora SC",
			escuela_id,
		});
		expect(renombrado).toEqual({ lista: true, escuela: false });
		expect(await nombres(escuela_id, lista_id)).toMatchObject({
			escuela: "Instituto Zamora",
			lista: "Instituto Zamora SC",
		});
	});

	it("si el nombre nuevo choca con otra escuela del mismo municipio, escuela_repetida y nada cambia", async () => {
		await interna("catalogo.crear_escuela_para_cliente", { nombre: "Primaria Hidalgo", municipio: "Zamora" });
		const { cliente, escuela_id, lista_id } = await clienteEscuela("Primaria Morelos");
		await expect(
			interna("catalogo.sincronizar_nombre_cliente", {
				cliente_id: cliente,
				nombre_anterior: "Primaria Morelos",
				nombre: "Primaria Hidalgo",
				escuela_id,
			}),
		).rejects.toMatchObject({ codigo: "escuela_repetida" });
		expect(await nombres(escuela_id, lista_id)).toMatchObject({
			escuela: "Primaria Morelos",
			lista: "Primaria Morelos",
		});
	});
});
