/**
 * Prueba de la lista de un cliente: nace vacía y sin porcentajes, una sola por cliente, se da de baja y se
 * reactiva con él; Catálogo le pone sus porcentajes; y la siembra de las listas y las categorías.
 * Fase 8 · docs/fases/08-catalogo.md (parte 2)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { renglonDeClienteDePrueba } from "../../../nucleo/pruebas/ventas-de-prueba.ts";

describe("la lista de un cliente nace vacía y sin porcentajes; Catálogo pone sus porcentajes", () => {
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

	/** La lista de un cliente, como está en la base. */
	async function lista(id: string) {
		const { rows } = await servidor.base.dueno.query(
			"SELECT tipo, nombre, nombre_corto, pct_basicos, pct_especiales, baja_en IS NOT NULL AS de_baja, version::int AS version FROM listas_precios WHERE id = $1",
			[id],
		);
		return rows[0];
	}

	it("la siembra trae Mostrador, Mayoreo y En línea, y las cuatro categorías de mayoreo", async () => {
		const listas = await servidor.base.dueno.query(
			"SELECT tipo, nombre FROM listas_precios WHERE tipo <> 'cliente' ORDER BY orden",
		);
		expect(listas.rows).toEqual([
			{ tipo: "mostrador", nombre: "Mostrador" },
			{ tipo: "mayoreo", nombre: "Mayoreo" },
			{ tipo: "en_linea", nombre: "En línea" },
		]);
		const categorias = await servidor.base.dueno.query(
			"SELECT nombre, porcentaje_que_aplica, defecto_para FROM categorias_mayoreo ORDER BY orden",
		);
		expect(categorias.rows).toEqual([
			{ nombre: "Básico", porcentaje_que_aplica: "basicos", defecto_para: "sin_escuela" },
			{ nombre: "Especial", porcentaje_que_aplica: "especiales", defecto_para: "con_escuela" },
			{ nombre: "Accesorio", porcentaje_que_aplica: "basicos", defecto_para: null },
			{ nombre: "Sin descuento", porcentaje_que_aplica: "ninguno", defecto_para: null },
		]);
	});

	it("nace vacía, sin porcentajes y con el nombre del cliente; otra para el mismo cliente, lista_repetida", async () => {
		const { clienteId: cliente } = await renglonDeClienteDePrueba(servidor);
		const creada = z
			.object({ lista_id: z.uuid() })
			.parse(
				await interna("catalogo.crear_lista_cliente", { cliente_id: cliente, nombre: "Distribuidora Escolar Jacona" }),
			);
		expect(await lista(creada.lista_id)).toMatchObject({
			tipo: "cliente",
			nombre: "Distribuidora Escolar Jacona",
			nombre_corto: "Distribuidora Escolar Jacona",
			pct_basicos: null,
			pct_especiales: null,
			de_baja: false,
		});
		await expect(
			interna("catalogo.crear_lista_cliente", { cliente_id: cliente, nombre: "Otro nombre" }),
		).rejects.toMatchObject({ codigo: "lista_repetida" });
	});

	it("Catálogo pone sus porcentajes con la versión; fuera de 0 a 100, 400; en una general, lista_no_es_de_cliente; de baja, lista_dada_de_baja", async () => {
		const { clienteId: cliente } = await renglonDeClienteDePrueba(servidor);
		const { lista_id } = z
			.object({ lista_id: z.uuid() })
			.parse(await interna("catalogo.crear_lista_cliente", { cliente_id: cliente, nombre: "Papelería Uruapan" }));
		const cambiar = async (id: string, pct_basicos: number | null, pct_especiales: number | null) =>
			mandarAccion(
				servidor,
				"catalogo.cambiar_porcentajes_cliente",
				{ datos: { lista_id: id, pct_basicos, pct_especiales }, version: (await lista(id))?.version },
				"catalogo",
			);
		const puesto = await cambiar(lista_id, 12, null);
		expect(puesto.cuerpo).toMatchObject({
			resultado: { mensaje: "Porcentajes de Papelería Uruapan guardados. Ventas a externos ya los usa" },
		});
		expect(await lista(lista_id)).toMatchObject({ pct_basicos: "12.000", pct_especiales: null });
		const { rows } = await servidor.base.dueno.query("SELECT descripcion FROM bitacora WHERE entidad_id = $1", [
			lista_id,
		]);
		expect(rows).toEqual([{ descripcion: "% de Papelería Uruapan: básicos sin % → 12 %; especiales sin % → sin %" }]);
		const fuera = await cambiar(lista_id, 101, 5);
		expect(fuera.estado).toBe(400);
		expect(fuera.cuerpo).toMatchObject({ campos: { pct_basicos: "Entre 0 y 100 %" } });
		const mostrador = (await servidor.base.dueno.query("SELECT id FROM listas_precios WHERE tipo = 'mostrador'"))
			.rows[0]?.id;
		expect((await cambiar(mostrador, 5, 5)).cuerpo).toMatchObject({ codigo: "lista_no_es_de_cliente" });
		await interna("catalogo.dar_baja_lista_cliente", { cliente_id: cliente, motivo: "Cerró" });
		expect(await lista(lista_id)).toMatchObject({ de_baja: true, pct_basicos: "12.000" });
		expect((await cambiar(lista_id, 10, 10)).cuerpo).toMatchObject({
			codigo: "lista_dada_de_baja",
			mensaje: "Papelería Uruapan está dada de baja con su cliente.",
		});
		await interna("catalogo.reactivar_lista_cliente", { cliente_id: cliente });
		expect(await lista(lista_id)).toMatchObject({ de_baja: false });
		expect((await cambiar(lista_id, 10, 15)).estado).toBe(200);
	});
});
