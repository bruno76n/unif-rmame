/**
 * Prueba de hacer habitual a un proveedor: tiene que surtir el material y estar activo; sube la versión del
 * material.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (parte 1)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { altaDeMaterial, altaDeProveedor, versionDe } from "../../../nucleo/pruebas/compras-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Hacer habitual a un proveedor sube la versión del material", () => {
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

	it("uno que no lo surte, no_lo_surte; el que ya es, ya_es_habitual; uno dado de baja, proveedor_dado_de_baja; el bueno, sí", async () => {
		const aurora = await altaDeProveedor(servidor, { nombre: "Textiles Aurora" });
		const norte = await altaDeProveedor(servidor, { nombre: "Telas del Norte" });
		const material = await altaDeMaterial(servidor, aurora, { nombre: "Gabardina azul marino" });
		const datos = (proveedor: string) => ({ material_id: material, proveedor_id: proveedor });
		expect((await mandar("hacer_habitual", "materiales", material, datos(norte))).cuerpo).toMatchObject({
			codigo: "no_lo_surte",
			mensaje: "Telas del Norte no surte Gabardina azul marino: agrégalo primero.",
		});
		expect((await mandar("hacer_habitual", "materiales", material, datos(aurora))).cuerpo).toMatchObject({
			codigo: "ya_es_habitual",
			mensaje: "Textiles Aurora ya es el habitual de Gabardina azul marino.",
		});
		await mandar("agregar_proveedor_material", "materiales", material, { ...datos(norte), precio_centavos: 8_200 });
		await mandar("dar_baja_proveedor", "proveedores", norte, { proveedor_id: norte, motivo: "Ya no vende" });
		expect((await mandar("hacer_habitual", "materiales", material, datos(norte))).cuerpo).toMatchObject({
			codigo: "proveedor_dado_de_baja",
			mensaje: "Telas del Norte está dado de baja.",
		});
		await mandar("reactivar_proveedor", "proveedores", norte, { proveedor_id: norte });
		const antes = await versionDe(servidor, "materiales", material);
		const hecho = await mandar("hacer_habitual", "materiales", material, datos(norte));
		expect(hecho.cuerpo.resultado).toMatchObject({
			mensaje:
				"Telas del Norte es el proveedor habitual de Gabardina azul marino. El pedido sugerido usa su tiempo de entrega",
		});
		expect(await versionDe(servidor, "materiales", material)).toBeGreaterThan(antes);
		const { rows } = await servidor.base.dueno.query("SELECT proveedor_habitual_id FROM materiales WHERE id = $1", [
			material,
		]);
		expect(rows).toEqual([{ proveedor_habitual_id: norte }]);
	});
});
