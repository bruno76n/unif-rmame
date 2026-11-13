/**
 * Prueba de `catalogo.escuelas_y_tallas` con los datos de la muestra: las escuelas con sus modelos activos y si son
 * cliente externo, los grupos de tallas en orden con cuántos productos los usan, los tipos de prenda con su sección y
 * su flujo, las secciones con sus productos activos; y solo Catálogo la lee.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor…») y docs/interfaz/fabrica/catalogo.md («Escuelas y tallas»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que regresa la consulta. */
interface EscuelasYTallas {
	escuelas: { id: string; nombre: string; cliente_externo: boolean; modelos: number; baja: boolean }[];
	grupos: { nombre: string; productos: number; tallas: { nombre: string }[] }[];
	tipos: { nombre: string; seccion: string; flujo: string | null }[];
	secciones: { nombre: string; lleva_receta: boolean; productos: number }[];
	flujos: { id: string; nombre: string }[];
}

describe("catalogo.escuelas_y_tallas: escuelas, grupos de tallas, tipos de prenda y secciones", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("trae las escuelas con sus modelos y si son cliente, los grupos en orden, los tipos y las secciones", async () => {
		const respuesta = await pedirConsulta(servidor, "catalogo.escuelas_y_tallas", {}, "catalogo");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		const resultado = respuesta.cuerpo.resultado as EscuelasYTallas;
		expect(resultado.escuelas).toHaveLength(6);
		const { rows } = await servidor.base.dueno.query(
			`SELECT e.id, (SELECT count(*)::int FROM productos p WHERE p.escuela_id = e.id AND p.baja_en IS NULL) AS modelos,
			   EXISTS (SELECT 1 FROM clientes c WHERE c.escuela_id = e.id AND c.baja_en IS NULL) AS cliente
			 FROM escuelas e`,
		);
		for (const escuela of resultado.escuelas) {
			const fila = rows.find((una) => una.id === escuela.id);
			expect(escuela, escuela.nombre).toMatchObject({ modelos: fila?.modelos, cliente_externo: fila?.cliente });
		}
		expect(resultado.grupos.map((grupo) => grupo.nombre)).toEqual([
			"Infantil",
			"Juvenil y adulto",
			"Pantalón por cintura",
			"Talla única",
		]);
		expect(resultado.grupos[0]?.tallas.map((talla) => talla.nombre)).toEqual([
			"3",
			"4",
			"6",
			"8",
			"10",
			"12",
			"14",
			"16",
			"18",
		]);
		expect(resultado.grupos[2]?.productos).toBe(2);
		expect(resultado.tipos.find((tipo) => tipo.nombre === "Playera")?.seccion).toBe("Playeras");
		expect(resultado.secciones).toHaveLength(7);
		expect(resultado.secciones.at(-1)).toMatchObject({ nombre: "Accesorios y servicios", lleva_receta: false });
		expect(resultado.flujos.length).toBeGreaterThan(0);
	});

	it("solo Catálogo la lee: Ventas y Bodega no", async () => {
		for (const quien of ["ventas", "bodega"]) {
			expect((await pedirConsulta(servidor, "catalogo.escuelas_y_tallas", {}, quien)).estado, quien).toBe(403);
		}
	});
});
