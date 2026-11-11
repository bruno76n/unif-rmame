/**
 * Prueba del precio sugerido a un cliente externo: sus cinco pasos, el redondeo a peso entero y el recargo que el
 * porcentaje nunca toca, con datos al azar y con la base.
 * Fase 8 · docs/fases/08-catalogo.md (parte 4)
 */

import { precioSugerido } from "@uniformame/compartido/calculos/precios";
import fc from "fast-check";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { nuevoProducto, siembraDelCatalogo, versionDelProducto } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("los cinco pasos del precio sugerido, con datos al azar", () => {
	const precio = fc.option(
		fc.integer({ min: 1, max: 99_999 }).map((pesos) => pesos * 100),
		{ nil: null },
	);
	const porcentaje = fc.option(
		fc.integer({ min: 0, max: 100_000 }).map((milesimas) => (milesimas / 1000).toFixed(3)),
		{ nil: null },
	);
	const datos = fc.record({
		listaCliente: precio,
		pctBasicos: porcentaje,
		pctEspeciales: porcentaje,
		aplica: fc.constantFrom("basicos" as const, "especiales" as const, "ninguno" as const),
		mostrador: precio,
		mayoreo: precio,
		esPedidoEspecial: fc.boolean(),
	});

	it("sigue el orden de los pasos, redondea a peso entero y nunca pasa de mostrador con un porcentaje", () => {
		fc.assert(
			fc.property(datos, (entrada) => {
				const sugerido = precioSugerido(entrada);
				if (entrada.listaCliente !== null) {
					expect(sugerido).toEqual({ precio: entrada.listaCliente, origen: "lista_cliente", porcentaje: null });
					return;
				}
				const tiene = entrada.pctBasicos !== null || entrada.pctEspeciales !== null;
				const toca =
					entrada.aplica === "ninguno"
						? "0"
						: entrada.aplica === "basicos"
							? entrada.pctBasicos
							: entrada.pctEspeciales;
				if (tiene && toca !== null && entrada.mostrador !== null) {
					expect(sugerido?.origen).toBe("porcentaje_cliente");
					expect((sugerido?.precio ?? 1) % 100).toBe(0);
					expect(sugerido?.precio).toBeLessThanOrEqual(entrada.mostrador);
					const exacto = entrada.mostrador * (1 - Number(toca) / 100);
					expect(Math.abs((sugerido?.precio ?? 0) - exacto)).toBeLessThanOrEqual(50);
					return;
				}
				if (!entrada.esPedidoEspecial && entrada.mayoreo !== null) {
					expect(sugerido?.origen).toBe("mayoreo");
				} else if (entrada.mostrador !== null) {
					expect(sugerido?.origen).toBe("mostrador");
				} else {
					expect(sugerido).toBeUndefined();
				}
			}),
		);
	});

	it("la mitad del peso redondea hacia arriba: $105 con 10 % da $94.50 → $95", () => {
		expect(
			precioSugerido({
				listaCliente: null,
				pctBasicos: "10.000",
				pctEspeciales: null,
				aplica: "basicos",
				mostrador: 10_500,
				mayoreo: null,
				esPedidoEspecial: false,
			}),
		).toEqual({ precio: 9_500, origen: "porcentaje_cliente", porcentaje: 10 });
	});
});

describe("el precio sugerido con la base: la lista del cliente, su porcentaje, Mayoreo, Mostrador y sin precio", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("cada paso, y en pedido especial el recargo aparte y sin Mayoreo", async () => {
		const siembra = await siembraDelCatalogo(servidor);
		const base = crearBase(servidor.base.app);
		const cliente = uuidv7();
		const { lista_id } = z
			.object({ lista_id: z.uuid() })
			.parse(
				await enAccionDePrueba(base, servidor.modulos, (contexto) =>
					contexto.interna("catalogo.crear_lista_cliente", { cliente_id: cliente, nombre: "Papelería del sugerido" }),
				),
			);
		const producto = await nuevoProducto(servidor, siembra, {
			canales: ["mostrador", "externos"],
			precios: [
				{ lista_id: siembra.listas.mostrador, precio_centavos: 41_000 },
				{ lista_id: siembra.listas.mayoreo, precio_centavos: 36_000 },
			],
		});
		const [cuatro] = producto.variantes;
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
		const sugerido = (variante: string | undefined) =>
			enAccionDePrueba(base, servidor.modulos, (contexto) =>
				contexto.lectura("catalogo.precio_sugerido", { cliente_id: cliente, variante_id: variante }),
			);
		// Sin precio ni porcentaje: Mayoreo; en pedido especial, Mostrador, con el recargo aparte.
		expect(await sugerido(cuatro?.variante_id)).toEqual({
			precio_sugerido_centavos: 36_000,
			origen_sugerido: "mayoreo",
			porcentaje_aplicado: null,
			recargo_especial_centavos: 0,
		});
		expect(await sugerido(dieciocho)).toEqual({
			precio_sugerido_centavos: 41_000,
			origen_sugerido: "mostrador",
			porcentaje_aplicado: null,
			recargo_especial_centavos: 5_000,
		});
		// Con su porcentaje de básicos: Mostrador menos 12 %, a peso entero; el recargo no lo toca.
		await servidor.base.dueno.query("UPDATE listas_precios SET pct_basicos = 12 WHERE id = $1", [lista_id]);
		expect(await sugerido(dieciocho)).toEqual({
			precio_sugerido_centavos: 36_100,
			origen_sugerido: "porcentaje_cliente",
			porcentaje_aplicado: 12,
			recargo_especial_centavos: 5_000,
		});
		// Con precio en su lista, ese.
		await servidor.base.dueno.query(
			"INSERT INTO precios (id, lista_id, producto_id, precio_centavos, origen) VALUES ($1, $2, $3, 33000, 'ficha')",
			[uuidv7(), lista_id, producto.producto_id],
		);
		expect(await sugerido(cuatro?.variante_id)).toMatchObject({
			precio_sugerido_centavos: 33_000,
			origen_sugerido: "lista_cliente",
		});
		// Sin ningún precio: el paso 5.
		const sinPrecio = await nuevoProducto(servidor, siembra, { canales: ["externos"], precios: [] });
		expect(await sugerido(sinPrecio.variantes[0]?.variante_id)).toMatchObject({
			precio_sugerido_centavos: null,
			origen_sugerido: null,
		});
	});
});
