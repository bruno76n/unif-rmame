/**
 * Prueba del orden de las tallas: primero el de su grupo y luego su lugar en él.
 * Fase 19 · docs/modulos/catalogo/tallas-y-tipos-de-prenda.md y la revisión de diseño de la fase 19 (las tallas salían
 * revueltas: CH, M, 4, 6…)
 */

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { ordenDeTallas } from "./tallas.ts";

describe("Las tallas se ordenan por su grupo y luego por su lugar en él", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("con tallas de varios grupos, no se revuelven: todo un grupo, en su orden, y luego el siguiente", async () => {
		const { rows } = await crearBase(servidor.base.app).execute(
			sql`SELECT g.orden AS grupo, t.orden AS lugar FROM tallas t JOIN grupos_talla g ON g.id = t.grupo_talla_id
				ORDER BY ${ordenDeTallas("t")}`,
		);
		const leidas = rows.map((fila) => [Number(fila.grupo), Number(fila.lugar)] as const);
		expect(new Set(leidas.map(([grupo]) => grupo)).size).toBeGreaterThan(1);
		const esperadas = [...leidas].sort((una, otra) => una[0] - otra[0] || una[1] - otra[1]);
		expect(leidas).toEqual(esperadas);
	});

	it("un alias que no es un nombre no entra a la consulta", () => {
		expect(() => ordenDeTallas("t; DROP TABLE tallas")).toThrow();
	});
});
