/**
 * Prueba de lo que baja del catálogo a la tablet: productos, variantes y tallas solo con lo suyo, nunca un precio,
 * un recargo ni un código de barras.
 * Fase 8 · docs/fases/08-catalogo.md (parte 3)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fotoCompleta } from "../../nucleo/pruebas/bajada-de-prueba.ts";
import { nuevoProducto, siembraDelCatalogo, versionDelProducto } from "../../nucleo/pruebas/catalogo-de-prueba.ts";
import { mandarAccion } from "../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../nucleo/pruebas/servidor-de-prueba.ts";

describe("a la tablet bajan productos, variantes y tallas solo con lo suyo", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("bajan todos, también los descontinuados y las dadas de baja, y nunca un precio, un recargo ni un código", async () => {
		const siembra = await siembraDelCatalogo(servidor);
		const producto = await nuevoProducto(servidor, siembra);
		const [cuatro] = producto.variantes;
		await mandarAccion(
			servidor,
			"catalogo.dar_baja_talla",
			{
				datos: { variante_id: cuatro?.variante_id, motivo: "Ya no se vende" },
				version: await versionDelProducto(servidor, producto.producto_id),
			},
			"catalogo",
		);
		await mandarAccion(
			servidor,
			"catalogo.descontinuar_productos",
			{
				datos: {
					productos: [
						{ producto_id: producto.producto_id, version: await versionDelProducto(servidor, producto.producto_id) },
					],
					motivo: "Ya no se fabrica",
				},
			},
			"catalogo",
		);
		const { cambios } = await fotoCompleta(servidor);
		const delProducto = cambios.find((cambio) => cambio.id === producto.producto_id);
		expect(delProducto).toEqual({
			tabla: "productos",
			op: "cambio",
			id: producto.producto_id,
			datos: { nombre: expect.any(String) },
		});
		const suyas = cambios.filter(
			(cambio) => cambio.tabla === "variantes" && cambio.datos?.producto_id === producto.producto_id,
		);
		expect(suyas).toHaveLength(3);
		expect(
			suyas.every(
				(cambio) =>
					Object.keys(cambio.datos ?? {})
						.sort()
						.join() === "producto_id,talla_id",
			),
		).toBe(true);
		const talla = cambios.find((cambio) => cambio.tabla === "tallas");
		expect(Object.keys(talla?.datos ?? {}).sort()).toEqual(["nombre", "orden"]);
		const texto = JSON.stringify(cambios);
		for (const prohibido of ["precio", "recargo", "codigo", "canal"]) expect(texto).not.toContain(prohibido);
		for (const variante of producto.variantes) expect(texto).not.toContain(`"${variante.codigo}"`);
		// Las tallas antes que los productos, y los productos antes que sus variantes.
		const tablas = cambios.map((cambio) => cambio.tabla);
		expect(tablas.lastIndexOf("tallas")).toBeLessThan(tablas.indexOf("productos"));
		expect(tablas.lastIndexOf("productos")).toBeLessThan(tablas.indexOf("variantes"));
	});
});
