/**
 * Prueba de la baja de un material: con existencia no se da de baja; sin ella, sí, y sale de la tablet.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (parte 1)
 *
 * Los candados `material_en_receta` y `material_en_orden` se prueban con las recetas (parte 2) y las órdenes
 * (parte 4).
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { altaDeMaterial, altaDeProveedor, versionDe } from "../../../nucleo/pruebas/compras-de-prueba.ts";
import { ubicacionesPorCodigo } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { escribirMovimiento } from "../../inventario/dominio/escribir-movimiento.ts";

describe("Un material con existencia no se da de baja", () => {
	let servidor: ServidorDePrueba;
	let ubicacion: Record<string, string>;
	let proveedor: string;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		ubicacion = await ubicacionesPorCodigo(servidor);
		proveedor = await altaDeProveedor(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Compras da de baja un material con la versión de ahora. */
	async function darBaja(materialId: string, motivo = "Ya no se usa") {
		return mandarAccion(
			servidor,
			"compras.dar_baja_material",
			{ datos: { material_id: materialId, motivo }, version: await versionDe(servidor, "materiales", materialId) },
			"compras",
		);
	}

	/** Un ajuste de material en una ubicación. */
	function ajuste(materialId: string, codigo: string, cantidad: string, entra: boolean) {
		const lugar = ubicacion[codigo] ?? "";
		return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			escribirMovimiento(contexto, {
				tipo: "ajuste",
				documento: { tipo: "ajuste", id: uuidv7() },
				renglones: [
					{ origen: entra ? null : lugar, destino: entra ? lugar : null, materialId, rolloId: null, cantidad },
				],
				clave: uuidv7(),
			}),
		);
	}

	it("con existencia responde material_con_existencia con cuánto y dónde; al acabarse, se da de baja", async () => {
		const material = await altaDeMaterial(servidor, proveedor, { nombre: "Botón blanco 4 hoyos" });
		await ajuste(material, "BOD", "120", true);
		await ajuste(material, "ADU", "30", true);
		expect((await darBaja(material)).cuerpo).toMatchObject({
			codigo: "material_con_existencia",
			mensaje: expect.stringMatching(/^Todavía hay 150 pza de Botón blanco 4 hoyos en .+ \(30\), .+ \(120\)\.$/),
		});
		await ajuste(material, "BOD", "120", false);
		await ajuste(material, "ADU", "30", false);
		expect((await darBaja(material, "ab")).cuerpo).toMatchObject({ campos: { motivo: "Escribe al menos 5 letras." } });
		const baja = await darBaja(material);
		expect(baja.cuerpo.resultado).toMatchObject({ mensaje: "Botón blanco 4 hoyos dado de baja" });
		const { rows } = await servidor.base.dueno.query(
			"SELECT baja_en IS NOT NULL AS de_baja, motivo_baja FROM materiales WHERE id = $1",
			[material],
		);
		expect(rows).toEqual([{ de_baja: true, motivo_baja: "Ya no se usa" }]);
		expect((await darBaja(material)).cuerpo).toMatchObject({ codigo: "material_dado_de_baja" });
	});
});
