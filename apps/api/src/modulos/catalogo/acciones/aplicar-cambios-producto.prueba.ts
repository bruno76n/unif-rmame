/**
 * Prueba de «Aplicar cambios»: los canales con sus reglas (también como CHECK de la base), cada precio cierra el
 * vigente y crea otro, la versión del producto sube, un renglón de bitácora por cambio y las etiquetas por
 * reimprimir.
 * Fase 8 · docs/fases/08-catalogo.md (parte 4)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	nuevoProducto,
	type SiembraDelCatalogo,
	siembraDelCatalogo,
	versionDelProducto,
} from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("«Aplicar cambios» aplica todo junto, cierra y crea cada precio y sube la versión del producto", () => {
	let servidor: ServidorDePrueba;
	let siembra: SiembraDelCatalogo;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		siembra = await siembraDelCatalogo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Aplica cambios con la versión que se dé, o la de ahora. */
	async function aplicar(productoId: string, cambios: Record<string, unknown>, version?: number) {
		return mandarAccion(
			servidor,
			"catalogo.aplicar_cambios_producto",
			{
				datos: { producto_id: productoId, ...cambios },
				version: version ?? (await versionDelProducto(servidor, productoId)),
			},
			"catalogo",
		);
	}

	/** Los precios de un producto en una lista, del más viejo al más nuevo. */
	async function historial(productoId: string, listaId: string | undefined) {
		const { rows } = await servidor.base.dueno.query(
			"SELECT variante_id, precio_centavos::int AS precio, fin_motivo, origen, vigente_hasta IS NULL AS vigente FROM precios WHERE producto_id = $1 AND lista_id = $2 ORDER BY vigente_desde, id",
			[productoId, listaId],
		);
		return rows;
	}

	it("un precio cierra el vigente (reemplazado) y crea otro (ficha), sube la versión y la ficha vieja recibe 409", async () => {
		const producto = await nuevoProducto(servidor, siembra);
		const antes = await versionDelProducto(servidor, producto.producto_id);
		const respuesta = await aplicar(producto.producto_id, {
			precios: [{ lista_id: siembra.listas.mostrador, variante_id: null, precio_centavos: 27_500 }],
		});
		expect(respuesta.cuerpo).toMatchObject({
			resultado: { cambios: 1, mensaje: expect.stringMatching(/^1 cambio aplicado a .+\. Ya llegan a las tiendas$/) },
		});
		expect(await historial(producto.producto_id, siembra.listas.mostrador)).toEqual([
			{ variante_id: null, precio: 25_000, fin_motivo: "reemplazado", origen: "alta_producto", vigente: false },
			{ variante_id: null, precio: 27_500, fin_motivo: null, origen: "ficha", vigente: true },
		]);
		expect(await versionDelProducto(servidor, producto.producto_id)).toBeGreaterThan(antes);
		const vieja = await aplicar(
			producto.producto_id,
			{ precios: [{ lista_id: siembra.listas.mostrador, variante_id: null, precio_centavos: 30_000 }] },
			antes,
		);
		expect(vieja.cuerpo).toMatchObject({ error: "conflicto_version" });
		const { rows } = await servidor.base.dueno.query(
			"SELECT descripcion FROM bitacora WHERE accion = 'catalogo.aplicar_cambios_producto' AND entidad_id = $1",
			[producto.producto_id],
		);
		expect(rows).toEqual([{ descripcion: "Precio de Mostrador: $250 → $275 +10%" }]);
	});

	it("varios cambios: un renglón de bitácora por cambio, todos con el mismo comando; el precio de talla y quitarlo", async () => {
		const producto = await nuevoProducto(servidor, siembra);
		const [, seis] = producto.variantes;
		await aplicar(producto.producto_id, {
			canales: { externos: true },
			recargo_pedido_especial_centavos: 6_000,
			categoria_mayoreo_id: siembra.categorias.Accesorio,
			precios: [
				{ lista_id: siembra.listas.mostrador, variante_id: seis?.variante_id, precio_centavos: 26_000 },
				{ lista_id: siembra.listas.mayoreo, variante_id: null, precio_centavos: 20_000 },
			],
		});
		const { rows } = await servidor.base.dueno.query(
			"SELECT descripcion, comando_id FROM bitacora WHERE accion = 'catalogo.aplicar_cambios_producto' AND entidad_id = $1 ORDER BY descripcion",
			[producto.producto_id],
		);
		expect(rows.map((renglon) => renglon.descripcion)).toEqual([
			"Básico a Accesorio",
			"Empieza a venderse a externos",
			"Precio de Mayoreo: $200 (nuevo)",
			"Precio de Mostrador, talla 6: $260 (nuevo)",
			"Recargo de pedido especial: $50 → $60",
		]);
		expect(new Set(rows.map((renglon) => renglon.comando_id)).size).toBe(1);
		await aplicar(producto.producto_id, {
			precios: [{ lista_id: siembra.listas.mostrador, variante_id: seis?.variante_id, precio_centavos: null }],
		});
		expect(
			(await historial(producto.producto_id, siembra.listas.mostrador)).filter((precio) => precio.variante_id !== null),
		).toEqual([
			{ variante_id: seis?.variante_id, precio: 26_000, fin_motivo: "quitado", origen: "ficha", vigente: false },
		]);
		expect((await aplicar(producto.producto_id, {})).cuerpo).toMatchObject({ codigo: "sin_cambios" });
	});

	it("en línea solo sin escuela y nunca un servicio; un producto activo siempre tiene un canal; y lo mismo como CHECK de la base", async () => {
		const producto = await nuevoProducto(servidor, siembra);
		expect((await aplicar(producto.producto_id, { canales: { mostrador: false } })).cuerpo).toMatchObject({
			codigo: "sin_canal",
		});
		const servicio = await nuevoProducto(servidor, siembra, { es_servicio: true });
		expect((await aplicar(servicio.producto_id, { canales: { en_linea: true } })).cuerpo).toMatchObject({
			codigo: "servicio_en_linea",
		});
		const enLinea = await aplicar(producto.producto_id, {
			canales: { en_linea: true },
			precios: [{ lista_id: siembra.listas.en_linea, variante_id: null, precio_centavos: 26_000 }],
		});
		expect(enLinea.estado).toBe(200);
		expect(
			(await aplicar(producto.producto_id, { canales: { en_linea: false, mostrador: false } })).cuerpo,
		).toMatchObject({
			codigo: "sin_canal",
		});
		const sinCanal = servidor.base.dueno.query(
			"UPDATE productos SET canal_mostrador = false, canal_en_linea = false, canal_externos = false WHERE id = $1",
			[producto.producto_id],
		);
		await expect(sinCanal).rejects.toMatchObject({ constraint: "productos_canal" });
		await servidor.base.dueno.query(
			"INSERT INTO escuelas (id, nombre, municipio, color) VALUES (gen_random_uuid(), 'Escuela del CHECK', 'Zamora', '#0F7C6B')",
		);
		await expect(
			servidor.base.dueno.query(
				"UPDATE productos SET escuela_id = (SELECT id FROM escuelas WHERE nombre = 'Escuela del CHECK') WHERE id = $1",
				[producto.producto_id],
			),
		).rejects.toMatchObject({ constraint: "productos_en_linea" });
	});

	it("una talla de pedido especial no lleva precio propio; una lista de un canal que no se vende no aplica; falta el de Mostrador", async () => {
		const producto = await nuevoProducto(servidor, siembra);
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
		const { variante_id } = especial.cuerpo.resultado as { variante_id: string };
		expect(
			(
				await aplicar(producto.producto_id, {
					precios: [{ lista_id: siembra.listas.mostrador, variante_id, precio_centavos: 30_000 }],
				})
			).cuerpo,
		).toMatchObject({
			codigo: "precio_talla_especial",
			mensaje: "La talla 18 es de pedido especial: cobra el precio base más $50.",
		});
		expect(
			(
				await aplicar(producto.producto_id, {
					precios: [{ lista_id: siembra.listas.en_linea, variante_id: null, precio_centavos: 30_000 }],
				})
			).cuerpo,
		).toMatchObject({ codigo: "lista_no_aplica" });
		expect(
			(
				await aplicar(producto.producto_id, {
					precios: [{ lista_id: siembra.listas.mostrador, variante_id: null, precio_centavos: null }],
				})
			).cuerpo,
		).toMatchObject({ codigo: "falta_precio", mensaje: "Falta el precio de Mostrador." });
	});

	it("con catalogo.etiqueta_lleva_precio, un cambio de Mostrador pasa a por_reimprimir solo las impresas que cobran ese precio; sin él, ninguna", async () => {
		const producto = await nuevoProducto(servidor, siembra);
		const [cuatro, seis, ocho] = producto.variantes;
		await servidor.base.dueno.query(
			"UPDATE variantes SET estado_etiqueta = 'impresa', etiqueta_impresa_en = now() WHERE id = ANY($1::uuid[])",
			[[cuatro?.variante_id, seis?.variante_id]],
		);
		const estados = async () =>
			Object.fromEntries(
				(
					await servidor.base.dueno.query("SELECT id, estado_etiqueta FROM variantes WHERE producto_id = $1", [
						producto.producto_id,
					])
				).rows.map((fila) => [fila.id, fila.estado_etiqueta]),
			);
		await aplicar(producto.producto_id, {
			precios: [{ lista_id: siembra.listas.mostrador, variante_id: seis?.variante_id, precio_centavos: 26_000 }],
		});
		expect(Object.values(await estados()).filter((estado) => estado === "por_reimprimir")).toHaveLength(0);
		await servidor.base.dueno.query(
			"UPDATE parametros SET valor_booleano = true WHERE clave = 'catalogo.etiqueta_lleva_precio'",
		);
		try {
			// La base cambia: la 4 (impresa) toma el base y se reimprime; la 6 tiene su propio precio y la 8 no está impresa.
			const respuesta = await aplicar(producto.producto_id, {
				precios: [{ lista_id: siembra.listas.mostrador, variante_id: null, precio_centavos: 28_000 }],
			});
			expect(respuesta.cuerpo).toMatchObject({
				avisos: expect.arrayContaining([
					expect.stringMatching(/^Cambió el precio de mostrador: 1 etiquetas de .+ quedan por reimprimir\.$/),
				]),
			});
			expect(await estados()).toEqual({
				[cuatro?.variante_id ?? ""]: "por_reimprimir",
				[seis?.variante_id ?? ""]: "impresa",
				[ocho?.variante_id ?? ""]: "por_imprimir",
			});
		} finally {
			await servidor.base.dueno.query(
				"UPDATE parametros SET valor_booleano = false WHERE clave = 'catalogo.etiqueta_lleva_precio'",
			);
		}
	});

	it("los avisos de la ficha: Mayoreo arriba de Mostrador y un cambio de más de 30 %", async () => {
		const producto = await nuevoProducto(servidor, siembra);
		const respuesta = await aplicar(producto.producto_id, {
			precios: [
				{ lista_id: siembra.listas.mostrador, variante_id: null, precio_centavos: 40_000 },
				{ lista_id: siembra.listas.mayoreo, variante_id: null, precio_centavos: 45_000 },
			],
		});
		expect(respuesta.cuerpo).toMatchObject({
			avisos: [
				"Ojo: Mayoreo ($450) quedó arriba de mostrador ($400).",
				"Ojo: El precio de Mostrador cambia más de 30% ($250 a $400). ¿Es correcto?",
			],
		});
	});
});
