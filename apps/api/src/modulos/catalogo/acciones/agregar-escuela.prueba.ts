/**
 * Prueba de agregar, editar y crear para un cliente una escuela: única por nombre y municipio sin importar
 * acentos ni mayúsculas, y con el color de la paleta en orden.
 * Fase 8 · docs/fases/08-catalogo.md (parte 1)
 */

import { paletaDeEscuelas } from "@uniformame/compartido/contratos/catalogo/escuelas";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que regresa agregar una escuela. */
const agregada = z.object({ escuela_id: z.uuid(), color: z.string(), mensaje: z.string() });

describe("una escuela es única por nombre y municipio sin importar acentos ni mayúsculas; su color sale de la paleta en orden", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Catálogo agrega una escuela. */
	function agregar(nombre: string, municipio: string, quien = "catalogo") {
		return mandarAccion(servidor, "catalogo.agregar_escuela", { datos: { nombre, municipio } }, quien);
	}

	it("la agrega con su color y su bitácora; la misma sin acentos ni mayúsculas, escuela_repetida; en otro municipio, sí", async () => {
		const respuesta = await agregar("Colegio Hidalgo", "Zamora");
		expect(respuesta.estado).toBe(200);
		const hidalgo = agregada.parse(respuesta.cuerpo.resultado);
		expect(hidalgo.mensaje).toBe("Colegio Hidalgo ya está en el catálogo. Ahora puedes crearle modelos");
		expect((await agregar("colegio hidalgo", "ZAMORA")).cuerpo).toMatchObject({
			codigo: "escuela_repetida",
			mensaje: "Esa escuela ya existe.",
		});
		expect((await agregar("Colegió Hidálgo", "Zámora")).cuerpo).toMatchObject({ codigo: "escuela_repetida" });
		expect((await agregar("Colegio Hidalgo", "Jacona")).estado).toBe(200);
		const { rows } = await servidor.base.dueno.query("SELECT descripcion FROM bitacora WHERE entidad_id = $1", [
			hidalgo.escuela_id,
		]);
		expect(rows).toEqual([{ descripcion: "Escuela nueva: Colegio Hidalgo, Zamora" }]);
	});

	it("cada escuela nueva toma el siguiente color de la paleta, y al acabarse vuelve a empezar", async () => {
		const { rows } = await servidor.base.dueno.query("SELECT count(*)::int AS n FROM escuelas");
		const antes = Number(rows[0]?.n);
		const colores: string[] = [];
		for (let i = 0; i < paletaDeEscuelas.length + 1; i++) {
			colores.push(agregada.parse((await agregar(`Escuela de color ${i}`, "Morelia")).cuerpo.resultado).color);
		}
		expect(colores).toEqual(
			Array.from(
				{ length: paletaDeEscuelas.length + 1 },
				(_, i) => paletaDeEscuelas[(antes + i) % paletaDeEscuelas.length],
			),
		);
	});

	it("nombre o municipio cortos responden 400; sin Catálogo, 403", async () => {
		const corta = await agregar("CH", "Za");
		expect(corta.estado).toBe(400);
		expect(corta.cuerpo).toMatchObject({
			campos: { nombre: "Escribe el nombre completo de la escuela.", municipio: "Escribe el municipio." },
		});
		expect((await agregar("Colegio Ventas", "Zamora", "ventas")).estado).toBe(403);
	});

	it("editarla cambia su nombre y municipio con su versión; a uno que ya existe, escuela_repetida", async () => {
		const una = agregada.parse((await agregar("Primaria Ocampo", "Uruapan")).cuerpo.resultado);
		await agregar("Primaria Morelos", "Uruapan");
		const version = async () =>
			Number(
				(await servidor.base.dueno.query("SELECT version FROM escuelas WHERE id = $1", [una.escuela_id])).rows[0]
					?.version,
			);
		const editar = async (nombre: string, municipio: string) =>
			mandarAccion(
				servidor,
				"catalogo.editar_escuela",
				{ datos: { escuela_id: una.escuela_id, nombre, municipio }, version: await version() },
				"catalogo",
			);
		expect((await editar("primaria morelos", "Uruapan")).cuerpo).toMatchObject({ codigo: "escuela_repetida" });
		const editada = await editar("Primaria Melchor Ocampo", "Uruapan");
		expect(editada.cuerpo).toMatchObject({ resultado: { mensaje: "Datos de Primaria Melchor Ocampo guardados" } });
		const { rows } = await servidor.base.dueno.query(
			"SELECT descripcion, antes, despues FROM bitacora WHERE accion = 'catalogo.editar_escuela' AND entidad_id = $1",
			[una.escuela_id],
		);
		expect(rows).toEqual([
			{
				descripcion: "Escuela Primaria Ocampo → Primaria Melchor Ocampo",
				antes: { nombre: "Primaria Ocampo", municipio: "Uruapan" },
				despues: { nombre: "Primaria Melchor Ocampo", municipio: "Uruapan" },
			},
		]);
	});

	it("la escuela de un cliente nace igual, y si ya existe dice que se escoja en la lista", async () => {
		const base = crearBase(servidor.base.app);
		const creada = await enAccionDePrueba(base, servidor.modulos, (contexto) =>
			contexto.interna("catalogo.crear_escuela_para_cliente", {
				nombre: "Colegio Guadalupe Victoria",
				municipio: "Jiquilpan",
			}),
		);
		expect(creada).toEqual({ escuela_id: expect.any(String) });
		await expect(
			enAccionDePrueba(base, servidor.modulos, (contexto) =>
				contexto.interna("catalogo.crear_escuela_para_cliente", {
					nombre: "COLEGIO GUADALUPE VICTORIA",
					municipio: "jiquilpan",
				}),
			),
		).rejects.toMatchObject({ codigo: "escuela_repetida", message: "Esa escuela ya existe: escógela en la lista." });
	});
});
