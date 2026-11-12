/**
 * Prueba de `inventario.registrar_carga_inicial`: la existencia de arranque entra sin AJ-, como un conteo inicial con 0
 * en el sistema, y solo donde esa variante no tiene movimientos.
 * Fase 14 · docs/fases/14-inventario-recepcion-del-taller-conteos-ajustes-y-reabasto.md («Criterios de terminado»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { libroPorUbicacion, salidaDe } from "../../../nucleo/pruebas/diferencias-de-prueba.ts";
import { ubicacionesPorCodigo, variantesLibres } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("La carga inicial entra sin AJ- y solo donde no hay movimientos", () => {
	let servidor: ServidorDePrueba;
	let ubicacion: Record<string, string>;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		ubicacion = await ubicacionesPorCodigo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Bodega registra la carga inicial. */
	function cargar(datos: Record<string, unknown>, quien = "bodega") {
		return mandarAccion(servidor, "inventario.registrar_carga_inicial", { datos }, quien);
	}

	/** El producto de una variante. */
	async function productoDe(variante: string): Promise<string> {
		const { rows } = await servidor.base.dueno.query("SELECT producto_id FROM variantes WHERE id = $1", [variante]);
		return String(rows[0]?.producto_id);
	}

	it("entra como `carga_inicial`, con su conteo inicial en 0 en el sistema y ningún AJ-; una variante en 0 no mueve", async () => {
		const [variante = "", otra = ""] = await variantesLibres(servidor, 2);
		const respuesta = await cargar({
			ubicacion_id: ubicacion.BOD,
			alcance: "toda",
			renglones: [
				{ variante_id: variante, piezas: 12 },
				{ variante_id: otra, piezas: 0 },
			],
		});
		const salida = salidaDe(respuesta);
		expect(salida.mensaje).toMatch(/^CN-\d{3}: carga inicial de 12 piezas en Bodega$/);
		expect(await libroPorUbicacion(servidor, [variante])).toEqual([{ codigo: "BOD", piezas: 12 }]);
		expect(await libroPorUbicacion(servidor, [otra])).toEqual([]);
		const { rows } = await servidor.base.dueno.query(
			`SELECT c.tipo, c.alcance, l.variante_id, l.piezas_sistema, l.piezas_contadas FROM conteos c
			 JOIN conteo_lineas l ON l.conteo_id = c.id WHERE c.id = $1 ORDER BY l.piezas_contadas DESC`,
			[salida.conteo_id],
		);
		expect(rows).toEqual([
			{ tipo: "inicial", alcance: "toda", variante_id: variante, piezas_sistema: 0, piezas_contadas: 12 },
			{ tipo: "inicial", alcance: "toda", variante_id: otra, piezas_sistema: 0, piezas_contadas: 0 },
		]);
		const { rows: movimientos } = await servidor.base.dueno.query(
			"SELECT tipo, documento_tipo FROM movimientos WHERE documento_id = $1",
			[salida.conteo_id],
		);
		expect(movimientos).toEqual([{ tipo: "carga_inicial", documento_tipo: "conteo" }]);
		expect(
			(
				await servidor.base.dueno.query("SELECT count(*)::int AS n FROM ajustes WHERE conteo_id = $1", [
					salida.conteo_id,
				])
			).rows,
		).toEqual([{ n: 0 }]);
		// Ya tiene movimientos en Bodega: va por conteo. En Aduana todavía no.
		expect(
			(
				await cargar({
					ubicacion_id: ubicacion.BOD,
					alcance: "toda",
					renglones: [{ variante_id: variante, piezas: 3 }],
				})
			).cuerpo,
		).toMatchObject({
			codigo: "ya_tiene_movimientos",
			mensaje: expect.stringMatching(/ ya tiene movimientos en Bodega: usa un conteo\.$/),
		});
		expect(
			(
				await cargar({
					ubicacion_id: ubicacion.ADU,
					alcance: "toda",
					renglones: [{ variante_id: variante, piezas: 3 }],
				})
			).estado,
		).toBe(200);
	});

	it("solo prendas del alcance, solo en Bodega o Aduana, solo Bodega, nunca después de ahora", async () => {
		const [variante = "", ajena = ""] = await variantesLibres(servidor, 2);
		const producto = await productoDe(variante);
		const renglones = [{ variante_id: variante, piezas: 1 }];
		expect((await cargar({ ubicacion_id: ubicacion.BOD, alcance: "prenda", renglones })).cuerpo).toMatchObject({
			campos: { producto_id: "Elige la prenda que vas a contar." },
		});
		if ((await productoDe(ajena)) !== producto) {
			expect(
				(
					await cargar({
						ubicacion_id: ubicacion.BOD,
						alcance: "prenda",
						producto_id: producto,
						renglones: [{ variante_id: ajena, piezas: 1 }],
					})
				).cuerpo,
			).toMatchObject({ codigo: "variante_ajena" });
		}
		expect((await cargar({ ubicacion_id: ubicacion.T1, alcance: "toda", renglones })).cuerpo).toMatchObject({
			codigo: "ubicacion_no_contable",
		});
		expect((await cargar({ ubicacion_id: ubicacion.ADU, alcance: "toda", renglones }, "aduana")).estado).toBe(403);
		expect(
			(
				await cargar({
					ubicacion_id: ubicacion.BOD,
					alcance: "toda",
					contado_en: new Date(Date.now() + 3_600_000).toISOString(),
					renglones,
				})
			).cuerpo,
		).toMatchObject({ campos: { contado_en: "La hora del conteo no puede ser después de ahora." } });
		expect(
			(await cargar({ ubicacion_id: ubicacion.BOD, alcance: "prenda", producto_id: producto, renglones })).estado,
		).toBe(200);
	});
});
