/**
 * Prueba del precio de una talla: el suyo o el base; en pedido especial, el base más el recargo, y vacío en En
 * línea y en Mayoreo.
 * Fase 8 · docs/fases/08-catalogo.md (parte 4)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { nuevoProducto, siembraDelCatalogo, versionDelProducto } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("el precio de una talla es el suyo o el base; en pedido especial, el base más el recargo, y vacío en En línea y en Mayoreo", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("el suyo, el base, el de pedido especial con su recargo y sin precio", async () => {
		const siembra = await siembraDelCatalogo(servidor);
		const producto = await nuevoProducto(servidor, siembra, {
			canales: ["mostrador", "en_linea"],
			precios: [
				{ lista_id: siembra.listas.mostrador, precio_centavos: 41_000 },
				{ lista_id: siembra.listas.mayoreo, precio_centavos: 35_000 },
			],
		});
		const [cuatro, seis] = producto.variantes;
		const especial = await mandarAccion(
			servidor,
			"catalogo.agregar_talla",
			{
				datos: {
					producto_id: producto.producto_id,
					talla_id: siembra.tallas.Infantil?.["18"],
					es_pedido_especial: true,
				},
				version: await versionDelProducto(servidor, producto.producto_id),
			},
			"catalogo",
		);
		const { variante_id: dieciocho } = especial.cuerpo.resultado as { variante_id: string };
		await mandarAccion(
			servidor,
			"catalogo.aplicar_cambios_producto",
			{
				datos: {
					producto_id: producto.producto_id,
					precios: [{ lista_id: siembra.listas.mostrador, variante_id: seis?.variante_id, precio_centavos: 43_500 }],
				},
				version: await versionDelProducto(servidor, producto.producto_id),
			},
			"catalogo",
		);
		const precio = (lista: string | undefined, variante: string | undefined) =>
			enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
				contexto.lectura("catalogo.precio_talla", { lista_id: lista, variante_id: variante }),
			);
		expect(await precio(siembra.listas.mostrador, cuatro?.variante_id)).toEqual({ precio_centavos: 41_000 });
		expect(await precio(siembra.listas.mostrador, seis?.variante_id)).toEqual({ precio_centavos: 43_500 });
		expect(await precio(siembra.listas.mostrador, dieciocho)).toEqual({ precio_centavos: 46_000 });
		expect(await precio(siembra.listas.mayoreo, dieciocho)).toEqual({ precio_centavos: null });
		expect(await precio(siembra.listas.en_linea, dieciocho)).toEqual({ precio_centavos: null });
		expect(await precio(siembra.listas.en_linea, cuatro?.variante_id)).toEqual({ precio_centavos: 41_000 });
		const sinPrecio = await nuevoProducto(servidor, siembra, { canales: ["externos"], precios: [] });
		expect(await precio(siembra.listas.mostrador, sinPrecio.variantes[0]?.variante_id)).toEqual({
			precio_centavos: null,
		});
	});
});
