/**
 * Prueba del historial de precios de compra: solo crece, cada renglón trae su anterior y su cambio, y el último
 * precio de cada par es siempre el renglón más nuevo.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md (parte 1)
 *
 * El historial que nace al enviar una orden se prueba con las órdenes (`marcar-orden-enviada.prueba.ts`, parte 4).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { altaDeMaterial, altaDeProveedor, versionDe } from "../../nucleo/pruebas/compras-de-prueba.ts";
import { mandarAccion } from "../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../nucleo/pruebas/servidor-de-prueba.ts";
import { cambioPorcentaje } from "./dominio/comunes.ts";

describe("El historial de precios solo crece y el rol de la app no lo cambia ni lo borra; cada renglón trae su anterior y su cambio; el último precio de cada par es siempre el renglón más nuevo", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("UPDATE y DELETE de precios_compra dan 42501", async () => {
		const proveedor = await altaDeProveedor(servidor);
		await altaDeMaterial(servidor, proveedor);
		for (const consulta of ["UPDATE precios_compra SET precio_centavos = 1", "DELETE FROM precios_compra"]) {
			await expect(servidor.base.app.query(consulta)).rejects.toMatchObject({ code: "42501" });
		}
	});

	it("al volver a agregar un proveedor, su renglón trae el anterior y el cambio, y el último del par es el más nuevo", async () => {
		const habitual = await altaDeProveedor(servidor);
		const otro = await altaDeProveedor(servidor);
		const material = await altaDeMaterial(servidor, habitual, { costo_centavos: 7_800 });
		const mandar = async (accion: string, datos: Record<string, unknown>) =>
			mandarAccion(
				servidor,
				`compras.${accion}`,
				{
					datos: { material_id: material, proveedor_id: otro, ...datos },
					version: await versionDe(servidor, "materiales", material),
				},
				"compras",
			);
		await mandar("agregar_proveedor_material", { precio_centavos: 8_000 });
		await mandar("quitar_proveedor_material", { motivo: "Subió el precio" });
		await mandar("agregar_proveedor_material", { precio_centavos: 9_200 });
		const { rows } = await servidor.base.dueno.query(
			`SELECT origen, precio_centavos::int AS precio, precio_anterior_centavos::int AS anterior, cambio_porcentaje
			 FROM precios_compra WHERE material_id = $1 AND proveedor_id = $2 ORDER BY creado_en`,
			[material, otro],
		);
		expect(rows).toEqual([
			{ origen: "proveedor_agregado", precio: 8_000, anterior: null, cambio_porcentaje: null },
			{ origen: "proveedor_agregado", precio: 9_200, anterior: 8_000, cambio_porcentaje: "15.000" },
		]);
		const { rows: diferentes } = await servidor.base.dueno.query(`
			SELECT mp.material_id FROM material_proveedores mp
			WHERE mp.ultimo_precio_centavos <> (
				SELECT pc.precio_centavos FROM precios_compra pc
				WHERE pc.material_id = mp.material_id AND pc.proveedor_id = mp.proveedor_id
				ORDER BY pc.creado_en DESC, pc.id DESC LIMIT 1)`);
		expect(diferentes).toEqual([]);
	});

	it("el cambio va con tres decimales; uno de más de 999.999 % se guarda como 999.999", () => {
		expect(cambioPorcentaje(7_800, 8_400)).toBe("7.692");
		expect(cambioPorcentaje(8_400, 7_800)).toBe("-7.143");
		expect(cambioPorcentaje(38, 7_800)).toBe("999.999");
	});
});
