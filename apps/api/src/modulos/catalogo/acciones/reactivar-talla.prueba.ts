/**
 * Prueba de descontinuar y reactivar una talla: descontinuar pide motivo; reactivar, no.
 * Fase 8 · docs/fases/08-catalogo.md (parte 3)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	nuevoProducto,
	type SiembraDelCatalogo,
	siembraDelCatalogo,
	versionDelProducto,
} from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("una talla descontinuada se reactiva sin motivo; cada cambio sube la versión del producto", () => {
	let servidor: ServidorDePrueba;
	let siembra: SiembraDelCatalogo;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		siembra = await siembraDelCatalogo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("descontinuar con motivo; otra vez, talla_ya_descontinuada; reactivar sin motivo; activa, talla_no_descontinuada", async () => {
		const producto = await nuevoProducto(servidor, siembra);
		const [, , ocho] = producto.variantes;
		const llamar = async (accion: string, datos: Record<string, unknown>) =>
			mandarAccion(
				servidor,
				accion,
				{
					datos: { variante_id: ocho?.variante_id, ...datos },
					version: await versionDelProducto(servidor, producto.producto_id),
				},
				"catalogo",
			);
		const antes = await versionDelProducto(servidor, producto.producto_id);
		const descontinuada = await llamar("catalogo.descontinuar_talla", { motivo: "Se vende poco" });
		expect(descontinuada.cuerpo).toMatchObject({
			resultado: { mensaje: "Talla 8 descontinuada: se vende hasta acabarla" },
		});
		expect(await versionDelProducto(servidor, producto.producto_id)).toBeGreaterThan(antes);
		expect((await llamar("catalogo.descontinuar_talla", { motivo: "Otra vez" })).cuerpo).toMatchObject({
			codigo: "talla_ya_descontinuada",
		});
		const reactivada = await llamar("catalogo.reactivar_talla", {});
		expect(reactivada.cuerpo).toMatchObject({ resultado: { mensaje: "Talla 8 vuelve a fabricarse" } });
		const { rows } = await servidor.base.dueno.query(
			"SELECT descontinuada_en, motivo_descontinuada, reactivada_en IS NOT NULL AS reactivada FROM variantes WHERE id = $1",
			[ocho?.variante_id],
		);
		expect(rows[0]).toEqual({ descontinuada_en: null, motivo_descontinuada: null, reactivada: true });
		const bitacora = await servidor.base.dueno.query(
			"SELECT antes FROM bitacora WHERE accion = 'catalogo.reactivar_talla' AND entidad_id = $1",
			[producto.producto_id],
		);
		expect(bitacora.rows).toEqual([{ antes: { descontinuada: true, motivo: "Se vende poco" } }]);
		expect((await llamar("catalogo.reactivar_talla", {})).cuerpo).toMatchObject({ codigo: "talla_no_descontinuada" });
	});
});
