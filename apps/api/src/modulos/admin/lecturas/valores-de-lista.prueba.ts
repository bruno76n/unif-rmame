/**
 * Prueba de la lectura `admin.valores_de_lista`.
 * Fase 19 · docs/modulos/admin/configuracion.md («`admin.valores_de_lista`»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("una lista se lee con sus valores vigentes, en su orden; sin los del sistema si se pide", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Lee una lista dentro de una acción de prueba. */
	function leer(datos: Record<string, unknown>): Promise<unknown> {
		return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.lectura("admin.valores_de_lista", datos),
		);
	}

	it("las categorías de gasto, con «Reparación de máquinas» solo si no se piden las seleccionables", async () => {
		const todas = (await leer({ lista: "categorias_gasto" })) as { valores: { nombre: string }[] };
		const seleccionables = (await leer({ lista: "categorias_gasto", solo_seleccionables: true })) as {
			valores: { nombre: string }[];
		};
		const { rows } = await servidor.base.dueno.query(
			`SELECT v.nombre FROM lista_valores v JOIN listas l ON l.id = v.lista_id
			 WHERE l.clave = 'categorias_gasto' AND v.baja_en IS NULL ORDER BY v.orden, v.nombre`,
		);
		expect(todas.valores.map((valor) => valor.nombre)).toEqual(rows.map((fila) => fila.nombre));
		expect(todas.valores.map((valor) => valor.nombre)).toContain("Reparación de máquinas");
		expect(seleccionables.valores.map((valor) => valor.nombre)).not.toContain("Reparación de máquinas");
		expect(seleccionables.valores.length).toBe(todas.valores.length - 1);
	});

	it("una lista que no existe no tiene valores", async () => {
		expect(await leer({ lista: "no_existe" })).toEqual({ valores: [] });
	});
});
