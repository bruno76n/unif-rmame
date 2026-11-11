/**
 * Prueba de la baja de un proveedor: el habitual de un material no se da de baja; su tercero no cambia; se
 * reactiva.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (parte 1)
 *
 * El candado `proveedor_con_ordenes` se prueba con las órdenes (parte 4).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { altaDeMaterial, altaDeProveedor, versionDe } from "../../../nucleo/pruebas/compras-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Un proveedor habitual no se da de baja", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Compras manda una acción sobre un proveedor con la versión de ahora. */
	async function sobreProveedor(accion: string, proveedorId: string, extra: Record<string, unknown> = {}) {
		return mandarAccion(
			servidor,
			`compras.${accion}`,
			{
				datos: { proveedor_id: proveedorId, ...extra },
				version: await versionDe(servidor, "proveedores", proveedorId),
			},
			"compras",
		);
	}

	it("el habitual de dos materiales nombra el primero y cuántos más; al dejar de serlo se da de baja y su tercero queda", async () => {
		const aurora = await altaDeProveedor(servidor, { nombre: "Textiles Aurora" });
		const otro = await altaDeProveedor(servidor, { nombre: "Telas del Norte" });
		const gabardina = await altaDeMaterial(servidor, aurora, { nombre: "Gabardina azul marino" });
		const popelina = await altaDeMaterial(servidor, aurora, { nombre: "Popelina blanca" });
		expect((await sobreProveedor("dar_baja_proveedor", aurora, { motivo: "Cerró la fábrica" })).cuerpo).toMatchObject({
			codigo: "proveedor_habitual_de",
			mensaje: "Textiles Aurora es el habitual de Gabardina azul marino y 1 más: haz habitual a otro antes.",
		});
		for (const material of [gabardina, popelina]) {
			await mandarAccion(
				servidor,
				"compras.agregar_proveedor_material",
				{
					datos: { material_id: material, proveedor_id: otro, precio_centavos: 8_000 },
					version: await versionDe(servidor, "materiales", material),
				},
				"compras",
			);
			await mandarAccion(
				servidor,
				"compras.hacer_habitual",
				{
					datos: { material_id: material, proveedor_id: otro },
					version: await versionDe(servidor, "materiales", material),
				},
				"compras",
			);
		}
		const baja = await sobreProveedor("dar_baja_proveedor", aurora, { motivo: "Cerró la fábrica" });
		expect(baja.cuerpo.resultado).toMatchObject({ mensaje: "Textiles Aurora dado de baja" });
		const { rows } = await servidor.base.dueno.query(
			"SELECT p.baja_en IS NOT NULL AS de_baja, t.es_proveedor FROM proveedores p JOIN terceros t ON t.id = p.tercero_id WHERE p.id = $1",
			[aurora],
		);
		expect(rows).toEqual([{ de_baja: true, es_proveedor: true }]);
		expect((await sobreProveedor("dar_baja_proveedor", aurora, { motivo: "Otra vez" })).cuerpo).toMatchObject({
			codigo: "proveedor_dado_de_baja",
		});
		expect((await sobreProveedor("reactivar_proveedor", aurora)).cuerpo.resultado).toMatchObject({
			mensaje: "Textiles Aurora vuelve a estar activo",
		});
		expect((await sobreProveedor("reactivar_proveedor", aurora)).cuerpo).toMatchObject({
			codigo: "proveedor_activo",
			mensaje: "Textiles Aurora ya está activo.",
		});
	});
});
