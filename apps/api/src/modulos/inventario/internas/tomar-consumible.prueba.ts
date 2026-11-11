/**
 * Prueba de `inventario.tomar_consumible`: un consumible tomado se descuenta de la ubicación de consumibles, en la
 * unidad de inventario y aunque quede negativo; un material que no es consumible no se toma.
 * Fase 11 · docs/fases/11-aduana-y-bodega.md (parte 1)
 */

import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { altaDeMaterial, altaDeProveedor } from "../../../nucleo/pruebas/compras-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Un consumible tomado se descuenta de la ubicación de consumibles, en la unidad de inventario y aunque quede negativo", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Lo que toma alguien en la tablet, ya en la unidad de inventario. */
	function tomar(renglones: { material_id: string; cantidad: string }[], id = uuidv7()) {
		return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.interna("inventario.tomar_consumible", {
				id,
				renglones,
				persona_id: null,
				dispositivo_id: null,
				ocurrido_en: Temporal.Now.instant().toString(),
			}),
		);
	}

	it("0.030 cajas (ya en la unidad de inventario) salen de Bodega con la persona, aunque no haya; la misma toma otra vez no repite", async () => {
		const proveedor = await altaDeProveedor(servidor);
		const agujas = await altaDeMaterial(servidor, proveedor, { tipo: "consumible", unidad: "cajas" });
		const id = uuidv7();
		await tomar([{ material_id: agujas, cantidad: "0.030" }], id);
		await tomar([{ material_id: agujas, cantidad: "0.030" }], id);
		const { rows } = await servidor.base.dueno.query(
			`SELECT u.codigo, e.cantidad FROM existencias_material e JOIN ubicaciones u ON u.id = e.ubicacion_id
			 WHERE e.material_id = $1 AND e.cantidad <> 0`,
			[agujas],
		);
		expect(rows).toEqual([{ codigo: "BOD", cantidad: "-0.030" }]);
		const { rows: movimiento } = await servidor.base.dueno.query(
			`SELECT m.tipo, m.documento_tipo, m.documento_id FROM movimientos m JOIN movimiento_lineas l ON l.movimiento_id = m.id
			 WHERE l.material_id = $1`,
			[agujas],
		);
		expect(movimiento).toEqual([{ tipo: "consumible_tomado", documento_tipo: "toma_consumible", documento_id: id }]);
	});

	it("un material que no es consumible no se toma", async () => {
		const proveedor = await altaDeProveedor(servidor);
		const boton = await altaDeMaterial(servidor, proveedor, { nombre: `Botón ${uuidv7().slice(-6)}` });
		await expect(tomar([{ material_id: boton, cantidad: "1" }])).rejects.toMatchObject({
			codigo: "no_es_consumible",
			message: expect.stringMatching(/^Botón .+ no es consumible\.$/),
		});
	});
});
