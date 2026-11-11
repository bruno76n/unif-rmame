/**
 * Prueba de agregar una talla: con el siguiente código, solo de los grupos del producto, y subiendo la versión
 * del producto; una talla dada de baja que se vuelve a agregar lleva código nuevo.
 * Fase 8 · docs/fases/08-catalogo.md (parte 3)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
	nuevoProducto,
	type SiembraDelCatalogo,
	siembraDelCatalogo,
	versionDelProducto,
} from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que regresa agregar una talla. */
const agregada = z.object({
	variante_id: z.uuid(),
	codigo: z.string(),
	mensaje: z.string(),
	version: z.number().int(),
});

describe("agregar una talla toma el siguiente código y sube la versión del producto; una talla dada de baja vuelve con otro código", () => {
	let servidor: ServidorDePrueba;
	let siembra: SiembraDelCatalogo;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		siembra = await siembraDelCatalogo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Agrega una talla con la versión que se dé. */
	function agregar(productoId: string, tallaId: string | undefined, version: number, especial = false) {
		return mandarAccion(
			servidor,
			"catalogo.agregar_talla",
			{ datos: { producto_id: productoId, talla_id: tallaId, es_pedido_especial: especial }, version },
			"catalogo",
		);
	}

	it("la normal nace por imprimir y la de pedido especial al fabricar; sube la versión y la versión vieja recibe 409", async () => {
		const producto = await nuevoProducto(servidor, siembra);
		const antes = await versionDelProducto(servidor, producto.producto_id);
		const diez = await agregar(producto.producto_id, siembra.tallas.Infantil?.["10"], antes);
		const normal = agregada.parse(diez.cuerpo.resultado);
		expect(normal.mensaje).toBe(`Talla 10 agregada con el código ${normal.codigo}. Falta imprimir su etiqueta`);
		expect(normal.version).toBeGreaterThan(antes);
		const vieja = await agregar(producto.producto_id, siembra.tallas.Infantil?.["12"], antes);
		expect(vieja.cuerpo).toMatchObject({ error: "conflicto_version" });
		const especial = agregada.parse(
			(await agregar(producto.producto_id, siembra.tallas.Infantil?.["18"], normal.version, true)).cuerpo.resultado,
		);
		expect(especial.mensaje).toBe(
			`Talla 18 agregada con el código ${especial.codigo}. Se etiqueta al fabricar el pedido`,
		);
		expect(Number(especial.codigo)).toBe(Number(normal.codigo) + 1);
		const { rows } = await servidor.base.dueno.query(
			"SELECT es_pedido_especial, estado_etiqueta FROM variantes WHERE id = ANY($1::uuid[]) ORDER BY codigo",
			[[normal.variante_id, especial.variante_id]],
		);
		expect(rows).toEqual([
			{ es_pedido_especial: false, estado_etiqueta: "por_imprimir" },
			{ es_pedido_especial: true, estado_etiqueta: "al_fabricar" },
		]);
	});

	it("la que ya tiene, talla_ya_existe; la de otro grupo, talla_de_otro_grupo; producto descontinuado, producto_descontinuado", async () => {
		const producto = await nuevoProducto(servidor, siembra);
		const version = await versionDelProducto(servidor, producto.producto_id);
		expect((await agregar(producto.producto_id, siembra.tallas.Infantil?.["4"], version)).cuerpo).toMatchObject({
			codigo: "talla_ya_existe",
		});
		expect((await agregar(producto.producto_id, siembra.tallas["Juvenil y adulto"]?.M, version)).cuerpo).toMatchObject({
			codigo: "talla_de_otro_grupo",
		});
		await mandarAccion(
			servidor,
			"catalogo.descontinuar_productos",
			{ datos: { productos: [{ producto_id: producto.producto_id, version }], motivo: "Ya no se hace" } },
			"catalogo",
		);
		const descontinuado = await agregar(
			producto.producto_id,
			siembra.tallas.Infantil?.["10"],
			await versionDelProducto(servidor, producto.producto_id),
		);
		expect(descontinuado.cuerpo).toMatchObject({ codigo: "producto_descontinuado" });
	});

	it("una talla dada de baja no vuelve: agregarla otra vez crea otra variante con código nuevo", async () => {
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
		const otra = agregada.parse(
			(
				await agregar(
					producto.producto_id,
					siembra.tallas.Infantil?.["4"],
					await versionDelProducto(servidor, producto.producto_id),
				)
			).cuerpo.resultado,
		);
		expect(otra.variante_id).not.toBe(cuatro?.variante_id);
		expect(otra.codigo).not.toBe(cuatro?.codigo);
		const { rows } = await servidor.base.dueno.query(
			"SELECT codigo, baja_en IS NOT NULL AS de_baja FROM variantes WHERE producto_id = $1 AND talla_id = $2 ORDER BY codigo",
			[producto.producto_id, siembra.tallas.Infantil?.["4"]],
		);
		expect(rows).toEqual([
			{ codigo: cuatro?.codigo, de_baja: true },
			{ codigo: otra.codigo, de_baja: false },
		]);
	});
});
