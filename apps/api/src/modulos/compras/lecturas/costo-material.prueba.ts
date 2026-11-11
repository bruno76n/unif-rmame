/**
 * Prueba de `compras.costo_material`: sin órdenes, el costo es el precio del alta, aunque se agregue otro
 * proveedor con otro precio; con órdenes, el precio vigente (el de la nota, si cobró otro) de la enviada más
 * reciente que no está cancelada, con cualquier proveedor.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (partes 1 y 4)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import {
	altaDeMaterial,
	altaDeProveedor,
	levantarDePrueba,
	ordenEnEstado,
	versionDe,
} from "../../../nucleo/pruebas/compras-de-prueba.ts";
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

	/** El costo de un material, como lo lee otro módulo. */
	async function costoDe(material: string) {
		const costos = await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.lectura("compras.costo_material", { material_ids: [material] }),
		);
		return z.record(z.string(), z.number()).parse(costos)[material];
	}

	it("con órdenes: la enviada más reciente que no está cancelada, con cualquier proveedor; la nota manda; un borrador no cuenta", async () => {
		const aurora = await altaDeProveedor(servidor);
		const bajio = await altaDeProveedor(servidor);
		const gabardina = await altaDeMaterial(servidor, aurora, { tipo: "tela", unidad: "m", costo_centavos: 7_800 });
		const linea = (proveedor: string, precio: number) => ({
			material_id: gabardina,
			proveedor_id: proveedor,
			cantidad: 1,
			precio_centavos: precio,
		});
		const vieja = await levantarDePrueba(servidor, [linea(bajio, 8_400)]);
		expect(await costoDe(gabardina)).toBe(7_800);
		await ordenEnEstado(servidor, vieja.id, "enviada", 60);
		expect(await costoDe(gabardina)).toBe(8_400);
		const nueva = await levantarDePrueba(servidor, [linea(aurora, 8_000)]);
		await ordenEnEstado(servidor, nueva.id, "enviada", 10);
		// Otro borrador con otro precio no cuenta.
		const tercero = await altaDeProveedor(servidor);
		await levantarDePrueba(servidor, [linea(tercero, 9_999)]);
		expect(await costoDe(gabardina)).toBe(8_000);
		await ordenEnEstado(servidor, nueva.id, "cancelada", 10);
		expect(await costoDe(gabardina)).toBe(8_400);
		const { rows } = await servidor.base.dueno.query("SELECT id FROM orden_compra_lineas WHERE orden_compra_id = $1", [
			vieja.id,
		]);
		await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.interna("compras.registrar_precios_nota", {
				orden_compra_id: vieja.id,
				lineas: [{ orden_compra_linea_id: rows[0]?.id, precio_centavos: 8_650 }],
			}),
		);
		expect(await costoDe(gabardina)).toBe(8_650);
	});
});
