/**
 * Prueba de descontinuar y reactivar productos: uno o varios, con motivo y un renglón por producto; reactivar
 * vuelve con sus canales, y no con la escuela dada de baja.
 * Fase 8 · docs/fases/08-catalogo.md (parte 3)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
	nuevoProducto,
	type SiembraDelCatalogo,
	siembraDelCatalogo,
	versionDelProducto,
} from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("descontinuar conserva todo y deja un renglón por producto; reactivar vuelve con sus canales", () => {
	let servidor: ServidorDePrueba;
	let siembra: SiembraDelCatalogo;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		siembra = await siembraDelCatalogo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Descontinúa productos con sus versiones de ahora. */
	async function descontinuar(ids: readonly string[], motivo = "Ya no se fabrica") {
		const productos = await Promise.all(
			ids.map(async (producto_id) => ({ producto_id, version: await versionDelProducto(servidor, producto_id) })),
		);
		return mandarAccion(servidor, "catalogo.descontinuar_productos", { datos: { productos, motivo } }, "catalogo");
	}

	it("varios a la vez, un renglón por producto con el mismo comando; ya descontinuados, ya_descontinuados", async () => {
		const [uno, dos] = [await nuevoProducto(servidor, siembra), await nuevoProducto(servidor, siembra)];
		const respuesta = await descontinuar([uno.producto_id, dos.producto_id]);
		expect(respuesta.cuerpo).toMatchObject({ resultado: { descontinuados: 2, mensaje: "2 productos descontinuados" } });
		const { rows } = await servidor.base.dueno.query(
			"SELECT entidad_id, comando_id FROM bitacora WHERE accion = 'catalogo.descontinuar_productos' AND entidad_id = ANY($1::uuid[])",
			[[uno.producto_id, dos.producto_id]],
		);
		expect(rows).toHaveLength(2);
		expect(new Set(rows.map((renglon) => renglon.comando_id)).size).toBe(1);
		expect((await descontinuar([uno.producto_id])).cuerpo).toMatchObject({ codigo: "ya_descontinuados" });
		expect((await descontinuar([uno.producto_id], "No")).cuerpo).toMatchObject({
			campos: { motivo: "Escribe al menos 5 letras." },
		});
	});

	it("reactivar vuelve con los canales que tenía; activo, producto_activo; con la escuela de baja, escuela_dada_de_baja", async () => {
		const escuela = z
			.object({ escuela_id: z.uuid() })
			.parse(
				(
					await mandarAccion(
						servidor,
						"catalogo.agregar_escuela",
						{ datos: { nombre: "Colegio Allende", municipio: "Zamora" } },
						"catalogo",
					)
				).cuerpo.resultado,
			).escuela_id;
		const producto = await nuevoProducto(servidor, siembra, {
			escuela_id: escuela,
			canales: ["mostrador", "externos"],
			categoria_mayoreo_id: siembra.categorias.Especial,
		});
		const reactivar = async () =>
			mandarAccion(
				servidor,
				"catalogo.reactivar_producto",
				{
					datos: { producto_id: producto.producto_id },
					version: await versionDelProducto(servidor, producto.producto_id),
				},
				"catalogo",
			);
		expect((await reactivar()).cuerpo).toMatchObject({ codigo: "producto_activo" });
		await descontinuar([producto.producto_id]);
		// Con un modelo activo la escuela no se da de baja; ya descontinuado, sí.
		const versionEscuela = async () =>
			Number(
				(await servidor.base.dueno.query("SELECT version FROM escuelas WHERE id = $1", [escuela])).rows[0]?.version,
			);
		await mandarAccion(
			servidor,
			"catalogo.dar_baja_escuela",
			{ datos: { escuela_id: escuela, motivo: "Cerró la escuela" }, version: await versionEscuela() },
			"catalogo",
		);
		expect((await reactivar()).cuerpo).toMatchObject({
			codigo: "escuela_dada_de_baja",
			mensaje: "Colegio Allende está dada de baja: reactívala antes.",
		});
		await mandarAccion(
			servidor,
			"catalogo.reactivar_escuela",
			{ datos: { escuela_id: escuela }, version: await versionEscuela() },
			"catalogo",
		);
		expect((await reactivar()).cuerpo).toMatchObject({
			resultado: { mensaje: expect.stringMatching(/vuelve a estar activo$/) },
		});
		const { rows } = await servidor.base.dueno.query(
			"SELECT canal_mostrador, canal_en_linea, canal_externos, baja_en FROM productos WHERE id = $1",
			[producto.producto_id],
		);
		expect(rows[0]).toEqual({ canal_mostrador: true, canal_en_linea: false, canal_externos: true, baja_en: null });
	});
});
