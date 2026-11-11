/**
 * Prueba de `catalogo.cambiar_precio_en_linea`: cierra el precio base de En línea y crea el nuevo con su origen,
 * sube la versión del producto, y no cambia nada si el producto no se vende en línea.
 * Fase 8 · docs/fases/08-catalogo.md (parte 4)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { nuevoProducto, siembraDelCatalogo, versionDelProducto } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("el precio en línea lo cambia `linea` por esta interna, solo si el producto se vende en línea", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Llama la interna como lo haría `linea`. */
	function cambiar(datos: Record<string, unknown>) {
		return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.interna("catalogo.cambiar_precio_en_linea", datos),
		);
	}

	it("cierra el vigente y crea el nuevo con su origen; sube la versión; sin el canal, canal_en_linea_apagado; sin pesos enteros, 400", async () => {
		const siembra = await siembraDelCatalogo(servidor);
		const producto = await nuevoProducto(servidor, siembra, { canales: ["mostrador", "en_linea"] });
		const antes = await versionDelProducto(servidor, producto.producto_id);
		expect(
			await cambiar({ producto_id: producto.producto_id, precio_centavos: 27_000, origen: "tienda_en_linea" }),
		).toEqual({
			antes_centavos: 25_000,
			despues_centavos: 27_000,
		});
		expect(await versionDelProducto(servidor, producto.producto_id)).toBeGreaterThan(antes);
		const { rows } = await servidor.base.dueno.query(
			"SELECT precio_centavos::int AS precio, origen, fin_motivo FROM precios WHERE producto_id = $1 AND lista_id = $2 ORDER BY vigente_desde, id",
			[producto.producto_id, siembra.listas.en_linea],
		);
		expect(rows).toEqual([
			{ precio: 25_000, origen: "alta_producto", fin_motivo: "reemplazado" },
			{ precio: 27_000, origen: "tienda_en_linea", fin_motivo: null },
		]);
		await expect(
			cambiar({ producto_id: producto.producto_id, precio_centavos: 27_050, origen: "tienda_en_linea" }),
		).rejects.toMatchObject({
			extra: { campos: { precio_centavos: "Escribe un precio mayor que cero" } },
		});
		const sinCanal = await nuevoProducto(servidor, siembra);
		await expect(
			cambiar({ producto_id: sinCanal.producto_id, precio_centavos: 27_000, origen: "tienda_en_linea" }),
		).rejects.toMatchObject({
			codigo: "canal_en_linea_apagado",
		});
	});
});
