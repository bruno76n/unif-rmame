/**
 * Prueba de agregar y quitar proveedores de un material: el habitual no deja de surtir, y cada cambio sube la
 * versión del material.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (parte 1)
 *
 * El candado `en_borrador` se prueba con las órdenes (parte 4).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	altaDeMaterial,
	altaDeProveedor,
	levantarDePrueba,
	ordenEnEstado,
	versionDe,
} from "../../../nucleo/pruebas/compras-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("El habitual no deja de surtir; agregar o quitar un proveedor sube la versión del material", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Compras manda una acción sobre el material con la versión dada (la de ahora, si no viene). */
	async function sobreMaterial(accion: string, materialId: string, datos: Record<string, unknown>, version?: number) {
		return mandarAccion(
			servidor,
			`compras.${accion}`,
			{
				datos: { material_id: materialId, ...datos },
				version: version ?? (await versionDe(servidor, "materiales", materialId)),
			},
			"compras",
		);
	}

	it("agregar sube la versión y deja su precio; quitar al habitual no se puede; quitar a otro deja su historial", async () => {
		const habitual = await altaDeProveedor(servidor, { nombre: "Botones Reyes" });
		const otro = await altaDeProveedor(servidor, { nombre: "Mercería Central" });
		const material = await altaDeMaterial(servidor, habitual, { nombre: "Botón negro 15 mm" });
		const antes = await versionDe(servidor, "materiales", material);
		const agregado = await sobreMaterial("agregar_proveedor_material", material, {
			proveedor_id: otro,
			precio_centavos: 42,
		});
		expect(agregado.cuerpo.resultado).toMatchObject({ mensaje: "Mercería Central ya surte Botón negro 15 mm" });
		expect(await versionDe(servidor, "materiales", material)).toBeGreaterThan(antes);
		// Con la versión de antes, quien lo veía en el cajón choca.
		expect((await sobreMaterial("hacer_habitual", material, { proveedor_id: otro }, antes)).estado).toBe(409);
		expect(
			(await sobreMaterial("agregar_proveedor_material", material, { proveedor_id: otro, precio_centavos: 42 })).cuerpo,
		).toMatchObject({ codigo: "ya_lo_surte", mensaje: "Mercería Central ya surte Botón negro 15 mm." });
		expect(
			(await sobreMaterial("quitar_proveedor_material", material, { proveedor_id: habitual, motivo: "Subió mucho" }))
				.cuerpo,
		).toMatchObject({
			codigo: "proveedor_habitual",
			mensaje: "Botones Reyes es el habitual de Botón negro 15 mm: haz habitual a otro antes de quitarlo.",
		});
		const versionAntesDeQuitar = await versionDe(servidor, "materiales", material);
		const quitado = await sobreMaterial("quitar_proveedor_material", material, {
			proveedor_id: otro,
			motivo: "Ya no lo tiene",
		});
		expect(quitado.cuerpo.resultado).toMatchObject({ mensaje: "Mercería Central ya no surte Botón negro 15 mm" });
		expect(await versionDe(servidor, "materiales", material)).toBeGreaterThan(versionAntesDeQuitar);
		const { rows } = await servidor.base.dueno.query(
			`SELECT mp.baja_en IS NOT NULL AS ya_no, (SELECT count(*)::int FROM precios_compra pc WHERE pc.material_id = mp.material_id AND pc.proveedor_id = mp.proveedor_id) AS precios
			 FROM material_proveedores mp WHERE mp.material_id = $1 AND mp.proveedor_id = $2`,
			[material, otro],
		);
		expect(rows).toEqual([{ ya_no: true, precios: 1 }]);
		expect(
			(await sobreMaterial("quitar_proveedor_material", material, { proveedor_id: otro, motivo: "Otra vez" })).cuerpo,
		).toMatchObject({ codigo: "no_lo_surte" });
		// Volver a agregarlo reactiva el mismo par, con su precio nuevo.
		await sobreMaterial("agregar_proveedor_material", material, { proveedor_id: otro, precio_centavos: 45 });
		const { rows: par } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n, bool_and(baja_en IS NULL) AS activo, max(ultimo_precio_centavos)::int AS precio FROM material_proveedores WHERE material_id = $1 AND proveedor_id = $2",
			[material, otro],
		);
		expect(par).toEqual([{ n: 1, activo: true, precio: 45 }]);
	});

	it("en un borrador con ese proveedor no se quita: nombra el borrador; enviada la orden, se quita", async () => {
		const habitual = await altaDeProveedor(servidor);
		const otro = await altaDeProveedor(servidor, { nombre: "Mercería del Centro" });
		const material = await altaDeMaterial(servidor, habitual, { nombre: "Botón azul 12 mm" });
		await sobreMaterial("agregar_proveedor_material", material, { proveedor_id: otro, precio_centavos: 40 });
		const orden = await levantarDePrueba(servidor, [
			{ material_id: material, proveedor_id: otro, cantidad: 10, precio_centavos: 40 },
		]);
		const quitar = () =>
			sobreMaterial("quitar_proveedor_material", material, { proveedor_id: otro, motivo: "Ya no lo tiene" });
		expect((await quitar()).cuerpo).toMatchObject({
			codigo: "en_borrador",
			mensaje: `Botón azul 12 mm está en el borrador ${orden.folio} con Mercería del Centro: descártalo o cámbialo antes.`,
		});
		await ordenEnEstado(servidor, orden.id, "enviada");
		expect((await quitar()).estado).toBe(200);
	});
});
