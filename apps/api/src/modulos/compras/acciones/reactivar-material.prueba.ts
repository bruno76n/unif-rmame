/**
 * Prueba de la reactivación de un material: no se reactiva si su proveedor habitual está dado de baja.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (parte 1)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { altaDeMaterial, altaDeProveedor, versionDe } from "../../../nucleo/pruebas/compras-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Un material cuyo habitual está dado de baja no se reactiva", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Compras manda una acción con la versión de ahora del renglón. */
	async function mandar(
		accion: string,
		tabla: "materiales" | "proveedores",
		id: string,
		datos: Record<string, unknown>,
	) {
		return mandarAccion(
			servidor,
			`compras.${accion}`,
			{ datos, version: await versionDe(servidor, tabla, id) },
			"compras",
		);
	}

	it("con su habitual de baja responde habitual_dado_de_baja; al reactivar al proveedor, el material vuelve", async () => {
		const proveedor = await altaDeProveedor(servidor, { nombre: "Cierres Reyes" });
		const material = await altaDeMaterial(servidor, proveedor, { nombre: "Cierre metálico 18 cm" });
		expect(
			(await mandar("reactivar_material", "materiales", material, { material_id: material })).cuerpo,
		).toMatchObject({
			codigo: "material_activo",
			mensaje: "Cierre metálico 18 cm ya está activo.",
		});
		await mandar("dar_baja_material", "materiales", material, { material_id: material, motivo: "Ya no se usa" });
		// Ya no es el habitual de un material activo: el proveedor se puede dar de baja.
		await mandar("dar_baja_proveedor", "proveedores", proveedor, { proveedor_id: proveedor, motivo: "Ya no vende" });
		expect(
			(await mandar("reactivar_material", "materiales", material, { material_id: material })).cuerpo,
		).toMatchObject({
			codigo: "habitual_dado_de_baja",
			mensaje: "Su proveedor habitual, Cierres Reyes, está dado de baja: reactívalo o haz habitual a otro.",
		});
		await mandar("reactivar_proveedor", "proveedores", proveedor, { proveedor_id: proveedor });
		const reactivado = await mandar("reactivar_material", "materiales", material, { material_id: material });
		expect(reactivado.cuerpo.resultado).toMatchObject({ mensaje: "Cierre metálico 18 cm vuelve a estar activo" });
		const { rows } = await servidor.base.dueno.query(
			"SELECT baja_en, motivo_baja, reactivado_en IS NOT NULL AS reactivado FROM materiales WHERE id = $1",
			[material],
		);
		expect(rows).toEqual([{ baja_en: null, motivo_baja: null, reactivado: true }]);
	});
});
