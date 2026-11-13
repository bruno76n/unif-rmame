/**
 * Prueba de `compras.material` con los datos de la muestra: sus proveedores con el habitual marcado y su último precio,
 * los que todavía no lo surten (para «Otro proveedor»), sus últimos precios (hasta 8, el más nuevo primero, con su
 * origen) y su versión, que sube cuando cambia uno de sus proveedores; y que solo la piden las cuentas con Compras.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver»)
 */

import { materialDeCompras } from "@uniformame/compartido/contratos/compras/consultas-cajones";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion, pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("El cajón de un material: sus proveedores, sus precios y cómo se pide", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide un material como Compras. */
	async function material(id: string) {
		const respuesta = await pedirConsulta(servidor, "compras.material", { material_id: id }, "compras");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return materialDeCompras.resultado.parse(respuesta.cuerpo.resultado);
	}

	it("trae un habitual entre sus proveedores, los que no lo surten y sus últimos precios", async () => {
		const { rows } = await servidor.base.dueno.query(
			"SELECT id, proveedor_habitual_id FROM materiales WHERE baja_en IS NULL ORDER BY nombre",
		);
		for (const fila of rows as { id: string; proveedor_habitual_id: string }[]) {
			const leido = await material(fila.id);
			expect(leido.proveedores.filter((proveedor) => proveedor.habitual).map((uno) => uno.proveedor_id)).toEqual([
				fila.proveedor_habitual_id,
			]);
			const surten = leido.proveedores.map((proveedor) => proveedor.proveedor_id);
			expect(leido.otros_proveedores.some((otro) => surten.includes(otro.proveedor_id))).toBe(false);
			expect(leido.precios.length).toBeGreaterThan(0);
			expect(leido.precios.length).toBeLessThanOrEqual(8);
			expect(leido.ultimo_precio_centavos).toBeGreaterThan(0);
		}
	});

	it("agregar un proveedor lo pasa a sus proveedores con su precio, y sube la versión del material", async () => {
		const { rows } = await servidor.base.dueno.query("SELECT id FROM materiales WHERE baja_en IS NULL LIMIT 1");
		const id = String(rows[0]?.id);
		const antes = await material(id);
		const [otro] = antes.otros_proveedores;
		if (otro === undefined) throw new Error("todos los proveedores surten este material");
		const agregado = await mandarAccion(
			servidor,
			"compras.agregar_proveedor_material",
			{
				datos: { material_id: id, proveedor_id: otro.proveedor_id, precio_centavos: 12_345 },
				version: antes.material.version,
			},
			"compras",
		);
		expect(agregado.estado, JSON.stringify(agregado.cuerpo)).toBe(200);
		const despues = await material(id);
		expect(despues.material.version).toBeGreaterThan(antes.material.version);
		expect(despues.proveedores.find((uno) => uno.proveedor_id === otro.proveedor_id)?.ultimo_precio_centavos).toBe(
			12_345,
		);
		expect(despues.precios[0]).toMatchObject({ precio_centavos: 12_345, origen: "al agregar al proveedor" });
	});

	it("solo la piden las cuentas con Compras: Bodega y Aduana nunca reciben precios", async () => {
		const { rows } = await servidor.base.dueno.query("SELECT id FROM materiales LIMIT 1");
		for (const quien of ["aduana", "bodega", "patronaje"]) {
			const respuesta = await pedirConsulta(servidor, "compras.material", { material_id: String(rows[0]?.id) }, quien);
			expect(respuesta.estado, quien).toBe(403);
			expect(JSON.stringify(respuesta.cuerpo)).not.toMatch(/precio/);
		}
	});
});
