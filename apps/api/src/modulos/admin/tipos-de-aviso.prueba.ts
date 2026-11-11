/**
 * Prueba de los tipos de aviso: el CHECK de `avisos.tipo` deja todos los que declaran el núcleo y los módulos.
 * Fase 9 · docs/modulos/admin/avisos.md («Los tipos») y la decisión 494
 *
 * Cada módulo que suma tipos los declara junto a sus tablas y reescribe el CHECK con la lista completa en su
 * migración; si una migración nueva se olvida de uno, esta prueba lo ve.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../nucleo/pruebas/servidor-de-prueba.ts";
import { tiposDeAvisoDeCatalogo } from "../catalogo/tablas.ts";
import { tiposDeAvisoDeInventario } from "../inventario/tablas.ts";
import { tiposDeAvisoDeProduccion } from "../produccion/tablas.ts";
import { tiposDeAvisoDelNucleo } from "./tablas.ts";

describe("el CHECK de avisos.tipo deja todos los tipos que se declaran", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("los del núcleo, los de Catálogo y los de Inventario", async () => {
		const { rows } = await servidor.base.dueno.query(
			"SELECT pg_get_constraintdef(oid) AS definicion FROM pg_constraint WHERE conname = 'avisos_tipo'",
		);
		const definicion = String(rows[0]?.definicion);
		for (const tipo of [
			...tiposDeAvisoDelNucleo,
			...tiposDeAvisoDeCatalogo,
			...tiposDeAvisoDeInventario,
			...tiposDeAvisoDeProduccion,
		]) {
			expect(definicion).toContain(`'${tipo}'`);
		}
	});
});
