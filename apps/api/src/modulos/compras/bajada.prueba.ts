/**
 * Prueba de lo que baja de Compras a la tablet: los consumibles activos con su nombre y sus unidades, nunca un
 * costo; al darse de baja, se quitan.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (parte 1)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bajarHastaTener, fotoCompleta } from "../../nucleo/pruebas/bajada-de-prueba.ts";
import { altaDeMaterial, altaDeProveedor, versionDe } from "../../nucleo/pruebas/compras-de-prueba.ts";
import { mandarAccion } from "../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../nucleo/pruebas/servidor-de-prueba.ts";

describe("A la tablet bajan los consumibles activos con su nombre y sus unidades, nunca un costo; al darse de baja, se quitan", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("baja el consumible con lo suyo y nada más; el avío no baja; al darlo de baja, baja como quitar", async () => {
		const proveedor = await altaDeProveedor(servidor);
		const agujas = await altaDeMaterial(servidor, proveedor, {
			nombre: "Agujas para recta",
			tipo: "consumible",
			unidad: "cajas",
			unidad_tablet: "agujas",
			factor_tablet: "100",
			minimo: 5,
		});
		const boton = await altaDeMaterial(servidor, proveedor, { nombre: "Botón blanco" });
		const { cambios, cursor } = await fotoCompleta(servidor);
		expect(cambios.filter((cambio) => cambio.tabla === "materiales" && [agujas, boton].includes(cambio.id))).toEqual([
			{
				tabla: "materiales",
				op: "cambio",
				id: agujas,
				datos: { nombre: "Agujas para recta", unidad: "cajas", unidad_tablet: "agujas", factor_tablet: 100 },
			},
		]);
		await mandarAccion(
			servidor,
			"compras.dar_baja_material",
			{
				datos: { material_id: agujas, motivo: "Ya no se usan" },
				version: await versionDe(servidor, "materiales", agujas),
			},
			"compras",
		);
		const despues = await bajarHastaTener(servidor, cursor, [agujas]);
		expect(despues.cambios.at(-1)).toEqual({ tabla: "materiales", op: "quitar", id: agujas, datos: null });
	});
});
