/**
 * Prueba de `compras.costo_material`: sin órdenes, el costo es el precio del alta, aunque se agregue otro
 * proveedor con otro precio.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (parte 1)
 *
 * El costo con órdenes enviadas (la más reciente que no está cancelada, con cualquier proveedor, y la nota que
 * manda) se prueba con las órdenes, en la parte 4.
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { altaDeMaterial, altaDeProveedor, versionDe } from "../../../nucleo/pruebas/compras-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("El costo de un material es el precio vigente de la orden enviada más reciente que no está cancelada, con cualquier proveedor, o el del alta", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("sin órdenes, el del alta, también con centavos; otro proveedor con otro precio no lo cambia; uno que no existe no viene", async () => {
		const proveedor = await altaDeProveedor(servidor);
		const otro = await altaDeProveedor(servidor);
		const boton = await altaDeMaterial(servidor, proveedor, { costo_centavos: 38 });
		const gabardina = await altaDeMaterial(servidor, proveedor, { tipo: "tela", unidad: "m", costo_centavos: 7_800 });
		await mandarAccion(
			servidor,
			"compras.agregar_proveedor_material",
			{
				datos: { material_id: gabardina, proveedor_id: otro, precio_centavos: 8_400 },
				version: await versionDe(servidor, "materiales", gabardina),
			},
			"compras",
		);
		const costos = await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.lectura("compras.costo_material", { material_ids: [boton, gabardina, uuidv7()] }),
		);
		expect(costos).toEqual({ [boton]: 38, [gabardina]: 7_800 });
	});
});
