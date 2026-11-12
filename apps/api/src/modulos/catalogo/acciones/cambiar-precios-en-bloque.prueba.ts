/**
 * Prueba del cambio de precios en bloque: pide «Confirmar con Google», respeta sus dos topes, redondea a $5 y, si
 * un precio saldría del rango, no cambia ninguno. La cuenta del precio, con datos al azar.
 * Fase 8 · docs/fases/08-catalogo.md (parte 4)
 */

import { type CambioEnBloque, precioDelCambioEnBloque } from "@uniformame/compartido/calculos/precios";
import { centavos } from "@uniformame/compartido/tipos/base";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import {
	nuevoProducto,
	type SiembraDelCatalogo,
	siembraDelCatalogo,
	versionDelProducto,
} from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { conGoogle, mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { renglonDeClienteDePrueba } from "../../../nucleo/pruebas/ventas-de-prueba.ts";

describe("el precio de un cambio en bloque, con datos al azar", () => {
	const cambio = fc.record<CambioEnBloque>({
		direccion: fc.constantFrom("subir", "bajar"),
		modo: fc.constantFrom("por_ciento", "pesos"),
		cantidad: fc.integer({ min: 1, max: 999 }),
		redondear: fc.boolean(),
	});
	const precio = fc.integer({ min: 1, max: 99_999 }).map((pesos) => pesos * 100);

	it("siempre es peso entero; con redondear, múltiplo de $5 a menos de $2.50 del exacto; sin él, a menos de 50 centavos", () => {
		fc.assert(
			fc.property(precio, cambio, (antes, deBloque) => {
				const nuevo = precioDelCambioEnBloque(centavos(antes), deBloque, 500);
				const signo = deBloque.direccion === "subir" ? 1 : -1;
				const exacto =
					antes + signo * (deBloque.modo === "pesos" ? deBloque.cantidad * 100 : (antes * deBloque.cantidad) / 100);
				expect(Number.isInteger(nuevo / 100)).toBe(true);
				if (deBloque.redondear) {
					expect(Number.isInteger(nuevo / 500)).toBe(true);
					expect(Math.abs(nuevo - exacto)).toBeLessThanOrEqual(250);
				} else {
					expect(Math.abs(nuevo - exacto)).toBeLessThanOrEqual(50.5);
				}
			}),
		);
	});

	it("con un redondeo que no es de pesos enteros ($2.50), toma el múltiplo de peso que le sigue: sigue en peso entero", () => {
		fc.assert(
			fc.property(precio, cambio, fc.integer({ min: 1, max: 2_000 }), (antes, deBloque, redondeo) => {
				const nuevo = precioDelCambioEnBloque(centavos(antes), deBloque, redondeo);
				expect(Number.isInteger(nuevo / 100)).toBe(true);
				if (deBloque.redondear)
					expect(Number.isInteger(nuevo / Math.max(100, Math.ceil(redondeo / 100) * 100))).toBe(true);
			}),
		);
		expect(
			precioDelCambioEnBloque(
				centavos(41_100),
				{ direccion: "subir", modo: "pesos", cantidad: 1, redondear: true },
				250,
			),
		).toBe(41_100);
	});

	it("subir y bajar en pesos son simétricos sin redondear", () => {
		fc.assert(
			fc.property(precio, fc.integer({ min: 1, max: 999 }), (antes, cantidad) => {
				const sube = precioDelCambioEnBloque(
					centavos(antes),
					{ direccion: "subir", modo: "pesos", cantidad, redondear: false },
					500,
				);
				expect(sube - antes).toBe(cantidad * 100);
			}),
		);
	});
});

describe("el cambio en bloque pide Google, respeta sus topes y no cambia ninguno si uno saldría del rango", () => {
	let servidor: ServidorDePrueba;
	let siembra: SiembraDelCatalogo;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		siembra = await siembraDelCatalogo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Manda un cambio en bloque, con Google confirmado si se pide. */
	async function bloque(
		productoIds: readonly string[],
		cambio: Record<string, unknown>,
		google = true,
		lista = siembra.listas.mostrador,
	) {
		const productos = await Promise.all(
			productoIds.map(async (producto_id) => ({
				producto_id,
				version: await versionDelProducto(servidor, producto_id),
			})),
		);
		return mandarAccion(
			servidor,
			"catalogo.cambiar_precios_en_bloque",
			{
				datos: {
					lista_id: lista,
					productos,
					direccion: "subir",
					modo: "por_ciento",
					cantidad: 10,
					redondear: true,
					...cambio,
				},
			},
			"catalogo",
			google ? conGoogle() : {},
		);
	}

	/** El precio vigente de Mostrador de un producto, base y por talla. */
	async function mostrador(productoId: string) {
		const { rows } = await servidor.base.dueno.query(
			"SELECT variante_id, precio_centavos::int AS precio, origen, confirmado_con_google_en IS NOT NULL AS con_google FROM precios WHERE producto_id = $1 AND lista_id = $2 AND vigente_hasta IS NULL ORDER BY variante_id NULLS FIRST",
			[productoId, siembra.listas.mostrador],
		);
		return rows;
	}

	it("sin Google, 401 reautenticar; con él sube el base y los de talla, redondea a $5, un renglón por producto y deja igual al que no tiene precio", async () => {
		const uno = await nuevoProducto(servidor, siembra);
		const [, seis] = uno.variantes;
		await mandarAccion(
			servidor,
			"catalogo.aplicar_cambios_producto",
			{
				datos: {
					producto_id: uno.producto_id,
					precios: [{ lista_id: siembra.listas.mostrador, variante_id: seis?.variante_id, precio_centavos: 26_300 }],
				},
				version: await versionDelProducto(servidor, uno.producto_id),
			},
			"catalogo",
		);
		const sinMostrador = await nuevoProducto(servidor, siembra, { canales: ["externos"], precios: [] });
		expect((await bloque([uno.producto_id], {}, false)).estado).toBe(401);
		const respuesta = await bloque([uno.producto_id, sinMostrador.producto_id], {});
		expect(respuesta.cuerpo).toMatchObject({
			resultado: {
				precios_cambiados: 2,
				sin_cambio: [sinMostrador.producto_id],
				mensaje: "2 precios actualizados en Mostrador. Quedan en la bitácora",
			},
		});
		expect(await mostrador(uno.producto_id)).toEqual([
			{ variante_id: null, precio: 27_500, origen: "cambio_en_bloque", con_google: true },
			{ variante_id: seis?.variante_id, precio: 29_000, origen: "cambio_en_bloque", con_google: true },
		]);
		const { rows } = await servidor.base.dueno.query(
			"SELECT descripcion FROM bitacora WHERE accion = 'catalogo.cambiar_precios_en_bloque' AND entidad_id = $1",
			[uno.producto_id],
		);
		expect(rows).toEqual([{ descripcion: "Precio de Mostrador: $250 → $275 +10%" }]);
	});

	it("dos productos que cambian: un renglón por producto, los dos con el mismo comando", async () => {
		const uno = await nuevoProducto(servidor, siembra);
		const otro = await nuevoProducto(servidor, siembra);
		expect((await bloque([uno.producto_id, otro.producto_id], {})).estado).toBe(200);
		const { rows } = await servidor.base.dueno.query(
			"SELECT entidad_id, comando_id FROM bitacora WHERE accion = 'catalogo.cambiar_precios_en_bloque' AND entidad_id = ANY($1::uuid[])",
			[[uno.producto_id, otro.producto_id]],
		);
		expect(rows.map((renglon) => renglon.entidad_id).sort()).toEqual([uno.producto_id, otro.producto_id].sort());
		expect(new Set(rows.map((renglon) => renglon.comando_id)).size).toBe(1);
	});

	it("con catalogo.etiqueta_lleva_precio, subir Mostrador pasa a por_reimprimir las impresas; sin él, ninguna", async () => {
		const producto = await nuevoProducto(servidor, siembra);
		const [cuatro, seis] = producto.variantes;
		await servidor.base.dueno.query(
			"UPDATE variantes SET estado_etiqueta = 'impresa', etiqueta_impresa_en = now() WHERE id = ANY($1::uuid[])",
			[[cuatro?.variante_id, seis?.variante_id]],
		);
		const porReimprimir = async () =>
			(
				await servidor.base.dueno.query(
					"SELECT id FROM variantes WHERE producto_id = $1 AND estado_etiqueta = 'por_reimprimir' ORDER BY id",
					[producto.producto_id],
				)
			).rows.map((fila) => fila.id);
		expect((await bloque([producto.producto_id], {})).estado).toBe(200);
		expect(await porReimprimir()).toEqual([]);
		await servidor.base.dueno.query(
			"UPDATE parametros SET valor_booleano = true WHERE clave = 'catalogo.etiqueta_lleva_precio'",
		);
		try {
			expect((await bloque([producto.producto_id], {})).estado).toBe(200);
			expect(await porReimprimir()).toEqual([cuatro?.variante_id, seis?.variante_id].sort());
		} finally {
			await servidor.base.dueno.query(
				"UPDATE parametros SET valor_booleano = false WHERE clave = 'catalogo.etiqueta_lleva_precio'",
			);
		}
	});

	it("un producto repetido o una lista dada de baja son 400; un descontinuado, producto_descontinuado", async () => {
		const producto = await nuevoProducto(servidor, siembra);
		expect((await bloque([producto.producto_id, producto.producto_id], {})).cuerpo).toMatchObject({
			campos: { productos: "Cada producto va una sola vez." },
		});
		const descontinuado = await nuevoProducto(servidor, siembra);
		await mandarAccion(
			servidor,
			"catalogo.descontinuar_productos",
			{
				datos: {
					productos: [
						{
							producto_id: descontinuado.producto_id,
							version: await versionDelProducto(servidor, descontinuado.producto_id),
						},
					],
					motivo: "Ya no se surte",
				},
			},
			"catalogo",
		);
		expect((await bloque([descontinuado.producto_id], {})).cuerpo).toMatchObject({ codigo: "producto_descontinuado" });
		// La lista de un cliente que se dio de baja.
		const base = crearBase(servidor.base.app);
		const { clienteId: cliente } = await renglonDeClienteDePrueba(servidor);
		const { lista_id } = z
			.object({ lista_id: z.uuid() })
			.parse(
				await enAccionDePrueba(base, servidor.modulos, (contexto) =>
					contexto.interna("catalogo.crear_lista_cliente", { cliente_id: cliente, nombre: "Uniformes de Sahuayo" }),
				),
			);
		await enAccionDePrueba(base, servidor.modulos, (contexto) =>
			contexto.interna("catalogo.dar_baja_lista_cliente", { cliente_id: cliente, motivo: "Cerró" }),
		);
		expect((await bloque([producto.producto_id], {}, true, lista_id)).cuerpo).toMatchObject({
			campos: { lista_id: "Escoge una lista de precios activa." },
		});
	});

	it("los dos topes; ningún precio en esa lista; y si uno saldría del rango no cambia ninguno", async () => {
		const barato = await nuevoProducto(servidor, siembra, {
			precios: [{ lista_id: siembra.listas.mostrador, precio_centavos: 300 }],
		});
		const otro = await nuevoProducto(servidor, siembra);
		expect((await bloque([otro.producto_id], { cantidad: 51 })).cuerpo).toMatchObject({
			codigo: "tope_por_ciento",
			mensaje: "Más de 50% se cambia producto por producto.",
		});
		expect(
			(await bloque([otro.producto_id], { modo: "pesos", cantidad: 999, direccion: "bajar" })).cuerpo,
		).toMatchObject({
			codigo: "precio_fuera_de_rango",
		});
		await servidor.base.dueno.query(
			"UPDATE parametros SET valor_entero = 50000 WHERE clave = 'catalogo.bloque_tope_centavos'",
		);
		try {
			expect((await bloque([otro.producto_id], { modo: "pesos", cantidad: 600 })).cuerpo).toMatchObject({
				codigo: "tope_pesos",
				mensaje: "Más de $500 se cambia producto por producto.",
			});
		} finally {
			await servidor.base.dueno.query(
				"UPDATE parametros SET valor_entero = 99900 WHERE clave = 'catalogo.bloque_tope_centavos'",
			);
		}
		const fuera = await bloque([otro.producto_id, barato.producto_id], {
			direccion: "bajar",
			modo: "pesos",
			cantidad: 5,
			redondear: false,
		});
		expect(fuera.cuerpo).toMatchObject({ codigo: "precio_fuera_de_rango" });
		expect(fuera.cuerpo.mensaje).toMatch(
			/quedaría en \$0: el precio va de \$1 a \$99,999\. Quítalo de la selección o cámbialo en su ficha\.$/,
		);
		expect((await mostrador(otro.producto_id))[0]).toMatchObject({ precio: 25_000, origen: "alta_producto" });
		expect((await bloque([otro.producto_id], {}, true, siembra.listas.en_linea)).cuerpo).toMatchObject({
			codigo: "sin_precio_en_lista",
		});
		// Bajar 1 % y redondear a $5 regresa al mismo precio: nada se mueve.
		expect((await bloque([otro.producto_id], { direccion: "bajar", cantidad: 1 })).cuerpo).toMatchObject({
			codigo: "sin_cambio",
		});
	});
});
