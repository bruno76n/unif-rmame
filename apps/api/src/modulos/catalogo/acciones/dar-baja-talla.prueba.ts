/**
 * Prueba de dar de baja una talla: con motivo, una sola vez, con su código retirado para siempre.
 * Fase 8 · docs/fases/08-catalogo.md (parte 3; los candados de existencia, reservas, lotes y pedidos llegan
 * con su módulo)
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

describe("dar de baja una talla retira su código para siempre y sube la versión del producto", () => {
	let servidor: ServidorDePrueba;
	let siembra: SiembraDelCatalogo;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		siembra = await siembraDelCatalogo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("con motivo la da de baja con su bitácora; otra vez, talla_dada_de_baja; sin motivo, 400", async () => {
		const producto = await nuevoProducto(servidor, siembra);
		const [, seis] = producto.variantes;
		const baja = async (motivo: string) =>
			mandarAccion(
				servidor,
				"catalogo.dar_baja_talla",
				{
					datos: { variante_id: seis?.variante_id, motivo },
					version: await versionDelProducto(servidor, producto.producto_id),
				},
				"catalogo",
			);
		expect((await baja("No")).cuerpo).toMatchObject({ campos: { motivo: "Escribe al menos 5 letras." } });
		const dada = await baja("No se vende la 6");
		expect(dada.cuerpo).toMatchObject({
			resultado: { mensaje: `Talla 6 dada de baja. El código ${seis?.codigo} no se vuelve a usar` },
		});
		expect((await baja("Otra vez")).cuerpo).toMatchObject({ codigo: "talla_dada_de_baja" });
		const { rows } = await servidor.base.dueno.query(
			"SELECT descripcion FROM bitacora WHERE accion = 'catalogo.dar_baja_talla' AND entidad_id = $1",
			[producto.producto_id],
		);
		expect(rows).toEqual([{ descripcion: `Talla 6, código ${seis?.codigo}. No se vende la 6` }]);
		// Reactivarla tampoco la regresa.
		const reactivar = await mandarAccion(
			servidor,
			"catalogo.reactivar_talla",
			{ datos: { variante_id: seis?.variante_id }, version: await versionDelProducto(servidor, producto.producto_id) },
			"catalogo",
		);
		expect(reactivar.cuerpo).toMatchObject({
			codigo: "talla_dada_de_baja",
			mensaje: "La talla 6 está dada de baja: agrégala otra vez y lleva código nuevo.",
		});
	});
});
