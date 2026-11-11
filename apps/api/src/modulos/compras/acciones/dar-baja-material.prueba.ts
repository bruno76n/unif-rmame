/**
 * Prueba de la baja de un material: con existencia o en la receta vigente de una prenda no se da de baja.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (partes 1 y 2)
 *
 * El candado `material_en_orden` se prueba con las órdenes (parte 4).
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { siembraDelCatalogo } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import {
	altaDeMaterial,
	altaDeProveedor,
	conMotivoSobreOrden,
	levantarDePrueba,
	ordenEnEstado,
	versionDe,
} from "../../../nucleo/pruebas/compras-de-prueba.ts";
import { ubicacionesPorCodigo } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import {
	guardarRecetaDePrueba,
	materialesDeReceta,
	prendaConReceta,
	recetaDeEjemplo,
} from "../../../nucleo/pruebas/patronaje-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { escribirMovimiento } from "../../inventario/dominio/escribir-movimiento.ts";

describe("Un material con existencia, en una orden abierta o en la receta vigente de una prenda no se da de baja", () => {
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

	it("en la receta vigente de una prenda no se da de baja: nombra la prenda", async () => {
		const siembra = await siembraDelCatalogo(servidor);
		const materiales = await materialesDeReceta(servidor);
		const prenda = await prendaConReceta(servidor, siembra);
		await guardarRecetaDePrueba(servidor, prenda, recetaDeEjemplo(prenda, materiales));
		expect((await darBaja(materiales.cierre)).cuerpo).toMatchObject({
			codigo: "material_en_receta",
			mensaje: expect.stringMatching(
				/^Cierre 14 cm .+ está en la receta vigente de Playera .+: cámbiala en Patronaje antes\.$/,
			),
		});
		// La popelina no está en ninguna receta: se da de baja.
		expect((await darBaja(materiales.popelina)).estado).toBe(200);
	});

	it("en una orden abierta no se da de baja: nombra la orden; cancelada la orden, se da de baja", async () => {
		const material = await altaDeMaterial(servidor, proveedor, { nombre: "Hilo poliéster negro" });
		const orden = await levantarDePrueba(servidor, [
			{ material_id: material, proveedor_id: proveedor, cantidad: 10, precio_centavos: 38 },
		]);
		await ordenEnEstado(servidor, orden.id, "enviada");
		expect((await darBaja(material)).cuerpo).toMatchObject({
			codigo: "material_en_orden",
			mensaje: `Hilo poliéster negro está en ${orden.folio}: termina o cancela la orden antes.`,
		});
		await conMotivoSobreOrden(servidor, "cancelar_orden", orden.id, "Ya no hace falta");
		expect((await darBaja(material)).estado).toBe(200);
	});
});
