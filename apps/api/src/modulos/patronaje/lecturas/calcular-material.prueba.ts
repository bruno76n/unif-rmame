/**
 * Prueba de `patronaje.calcular_material` y `patronaje.desperdicio_prenda`: la API corre la misma cuenta que la
 * pantalla, con la receta guardada y el desperdicio estimado; sin receta, nada; una talla sin valor, «—».
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (parte 2)
 */

import { cuentaDeMaterial } from "@uniformame/compartido/calculos/cuenta-material";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { type SiembraDelCatalogo, siembraDelCatalogo } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import {
	guardarRecetaDePrueba,
	type MaterialesDeReceta,
	materialesDeReceta,
	prendaConReceta,
	recetaDeEjemplo,
} from "../../../nucleo/pruebas/patronaje-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("La cuenta de material da lo mismo en la pantalla y en la API: la tela principal con desperdicio, todo hacia arriba, un cono por lo menos, y «—» si falta un dato", () => {
	let servidor: ServidorDePrueba;
	let siembra: SiembraDelCatalogo;
	let materiales: MaterialesDeReceta;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		siembra = await siembraDelCatalogo(servidor);
		materiales = await materialesDeReceta(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Lee como lo haría otro módulo. */
	function leer(nombre: string, datos: unknown) {
		return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.lectura(`patronaje.${nombre}`, datos),
		);
	}

	it("con la receta vigente y el 6 % estimado: lo mismo que la cuenta de la pantalla, y el hilo en conos, al menos uno", async () => {
		const prenda = await prendaConReceta(servidor, siembra);
		await guardarRecetaDePrueba(servidor, prenda, recetaDeEjemplo(prenda, materiales));
		const piezas = { [prenda.tallas["4"] ?? ""]: 40, [prenda.tallas["6"] ?? ""]: 50, [prenda.tallas["8"] ?? ""]: 100 };
		const cuenta = (await leer("calcular_material", {
			producto_id: prenda.productoId,
			piezas_por_talla: Object.entries(piezas).map(([talla_id, suyas]) => ({ talla_id, piezas: suyas })),
		})) as {
			receta_version_id: string;
			desperdicio_pct: string;
			materiales: { material_id: string; cantidad: number }[];
		};
		expect(cuenta.desperdicio_pct).toBe("6.000");
		// (40 × 1 + 50 × 1.05 + 100 × 1.10) × 1.06 = 214.05 → 215; 190 cierres; 190 × 45 m ÷ 5,000 = 1.71 → 2 conos.
		expect(Object.fromEntries(cuenta.materiales.map((material) => [material.material_id, material.cantidad]))).toEqual({
			[materiales.gabardina]: 215,
			[materiales.cierre]: 190,
			[materiales.hilo]: 2,
		});
		// La pantalla corre la misma función con los mismos insumos.
		const enLaPantalla = cuentaDeMaterial(
			[
				{
					materialId: materiales.gabardina,
					esTelaPrincipal: true,
					cantidad: null,
					porTalla: {
						[prenda.tallas["4"] ?? ""]: "1",
						[prenda.tallas["6"] ?? ""]: "1.05",
						[prenda.tallas["8"] ?? ""]: "1.1",
					},
					recetaPorUnidadInventario: "1",
					seCuentaEntera: false,
				},
				{
					materialId: materiales.cierre,
					esTelaPrincipal: false,
					cantidad: "1",
					porTalla: {},
					recetaPorUnidadInventario: "1",
					seCuentaEntera: true,
				},
				{
					materialId: materiales.hilo,
					esTelaPrincipal: false,
					cantidad: "45",
					porTalla: {},
					recetaPorUnidadInventario: "5000",
					seCuentaEntera: true,
				},
			],
			piezas,
			"6",
		);
		expect(enLaPantalla).toEqual({ [materiales.gabardina]: 215, [materiales.cierre]: 190, [materiales.hilo]: 2 });
	});

	it("una talla con piezas que la receta no tiene da «—»; sin receta, ningún material", async () => {
		const prenda = await prendaConReceta(servidor, siembra);
		const ajena = siembra.tallas["Juvenil y adulto"]?.CH ?? "";
		expect(
			await leer("calcular_material", {
				producto_id: prenda.productoId,
				piezas_por_talla: [{ talla_id: ajena, piezas: 3 }],
			}),
		).toMatchObject({ receta_version_id: null, materiales: [] });
		await guardarRecetaDePrueba(servidor, prenda, recetaDeEjemplo(prenda, materiales));
		const cuenta = (await leer("calcular_material", {
			producto_id: prenda.productoId,
			piezas_por_talla: [{ talla_id: ajena, piezas: 3 }],
		})) as { materiales: { material_id: string; cantidad: number | null }[] };
		expect(cuenta.materiales.find((material) => material.material_id === materiales.gabardina)?.cantidad).toBeNull();
		expect(cuenta.materiales.find((material) => material.material_id === materiales.cierre)?.cantidad).toBe(3);
	});

	it("sin cortes, el desperdicio es el estimado: no medido, dato flojo y no alto", async () => {
		const prenda = await prendaConReceta(servidor, siembra);
		expect(await leer("desperdicio_prenda", { producto_id: prenda.productoId })).toEqual({
			prendas: [
				{
					producto_id: prenda.productoId,
					desperdicio_pct: "6.000",
					medido: false,
					lotes: 0,
					alto: false,
					dato_flojo: true,
				},
			],
		});
		expect(await leer("desperdicio_prenda", {})).toEqual({ prendas: [] });
	});
});
